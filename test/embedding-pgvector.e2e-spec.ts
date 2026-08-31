import { DataSource } from 'typeorm';
import dataSource from '../src/database/data-source';

const run = process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

run('Embedding pgvector schema (e2e)', () => {
  let data: DataSource;
  beforeAll(async () => {
    data = dataSource;
    await data.initialize();
  });
  afterAll(async () => data.destroy());

  it('has pgvector 0.8.6 and embedding tables', async () => {
    const extension = await data.query(
      `SELECT extversion FROM pg_extension WHERE extname='vector'`,
    );
    expect(extension[0]?.extversion).toBe('0.8.6');
    const tables = await data.query(
      `SELECT to_regclass('content_chunk_embeddings') AS embeddings, to_regclass('embedding_jobs') AS jobs`,
    );
    expect(tables[0]).toEqual({ embeddings: 'content_chunk_embeddings', jobs: 'embedding_jobs' });
  });

  it('supports cosine operations and enforces vector dimension', async () => {
    const distance = await data.query(`SELECT '[1,0,0]'::vector <=> '[0,1,0]'::vector AS value`);
    expect(Number(distance[0]?.value)).toBe(1);
    await expect(
      data.query(`SELECT array_fill(0.0, ARRAY[1535])::vector::vector(1536)`),
    ).rejects.toThrow();
  });

  it('stores a 1536-dimensional vector against a chunk and rejects duplicate config rows', async () => {
    const runner = data.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const suffix = Date.now().toString();
      const [user] = await runner.query(
        `INSERT INTO users(name,email,password_hash,role,email_verified) VALUES ('Embedding Test',$1,'test-hash','SYSTEM_ADMIN',true) RETURNING id`,
        [`embedding-${suffix}@example.test`],
      );
      const [document] = await runner.query(
        `INSERT INTO knowledge_documents(tenant_scope,title,source_type,rights_metadata,status,created_by)
         VALUES ('GLOBAL','Embedding technical test','TXT','{"permissionConfirmed":true,"sourceOwner":"test"}','DRAFT',$1) RETURNING id`,
        [user.id],
      );
      const [version] = await runner.query(
        `INSERT INTO document_versions(document_id,version_no,storage_key,checksum,mime_type,validated_mime_type,original_filename,file_size,extraction_status,malware_scan_status)
         VALUES ($1,1,$2,$3,'text/plain','text/plain','test.txt',1,'COMPLETED','CLEAN') RETURNING id`,
        [document.id, `test/${suffix}`, 'a'.repeat(64)],
      );
      const [chunk] = await runner.query(
        `INSERT INTO content_chunks(document_version_id,tenant_scope,content,content_hash,estimated_token_count,locator_metadata,chunk_order)
         VALUES ($1,'GLOBAL','inertia',$2,1,'{"type":"TEXT_LINES","lineFrom":1,"lineTo":1}',1) RETURNING id`,
        [version.id, 'b'.repeat(64)],
      );
      const vector = `[1,${Array.from({ length: 1535 }, () => '0').join(',')}]`;
      await runner.query(
        `INSERT INTO content_chunk_embeddings(content_chunk_id,provider,model,embedding_config_version,dimension,distance_metric,content_hash,status,embedding,embedded_at)
         VALUES ($1,'test','deterministic-test-v1','technical-config',1536,'cosine',$2,'COMPLETED',$3::vector,now())`,
        [chunk.id, 'b'.repeat(64), vector],
      );
      const [stored] = await runner.query(
        `SELECT vector_dims(embedding) AS dimensions FROM content_chunk_embeddings WHERE content_chunk_id=$1`,
        [chunk.id],
      );
      expect(stored.dimensions).toBe(1536);
      await expect(
        runner.query(
          `INSERT INTO content_chunk_embeddings(content_chunk_id,provider,model,embedding_config_version,dimension,distance_metric,content_hash,status)
           VALUES ($1,'test','deterministic-test-v1','technical-config',1536,'cosine',$2,'PENDING')`,
          [chunk.id, 'b'.repeat(64)],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
