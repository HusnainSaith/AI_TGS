import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurriculumStatus } from '../curriculum/curriculum-status.enum';
import { CreateGenerationDto } from './dto/generation.dto';
import { ValidatedCurriculum } from './generation.contracts';
@Injectable()
export class GenerationCurriculumService {
  constructor(private readonly data: DataSource) {}
  async validate(dto: CreateGenerationDto): Promise<Map<string, ValidatedCurriculum>> {
    if (dto.sectionId) {
      const rows = await this.data.query(
        `SELECT id FROM sections WHERE id=$1 AND class_id=$2 AND status=$3`,
        [dto.sectionId, dto.classId, CurriculumStatus.ACTIVE],
      );
      if (!rows.length)
        throw new BadRequestException('Section does not belong to the selected active Class');
    }
    const topicIds = [...new Set(dto.units.map((unit) => unit.topicId))];
    const rows = await this.data.query(
      `SELECT t.id topic_id,t.name topic_name,t.description topic_description,ch.id chapter_id,ch.name chapter_name,s.id subject_id,s.name subject_name,s.class_id,c.name class_name,s.board_id FROM topics t JOIN chapters ch ON ch.id=t.chapter_id JOIN subjects s ON s.id=ch.subject_id JOIN classes c ON c.id=s.class_id JOIN boards b ON b.id=s.board_id WHERE t.id=ANY($1::uuid[]) AND t.status='ACTIVE' AND ch.status='ACTIVE' AND s.status='ACTIVE' AND c.status='ACTIVE' AND b.status='ACTIVE'`,
      [topicIds],
    );
    if (rows.length !== topicIds.length)
      throw new BadRequestException('A selected curriculum path is missing or archived');
    const map = new Map<string, ValidatedCurriculum>();
    for (const row of rows as Record<string, string | null>[]) {
      const requested = dto.units.find((unit) => unit.topicId === row.topic_id)!;
      if (row.class_id !== dto.classId)
        throw new BadRequestException('Subject does not belong to the selected Class');
      if (row.subject_id !== dto.subjectId)
        throw new BadRequestException('Chapter does not belong to the selected Subject');
      if (row.chapter_id !== requested.chapterId)
        throw new BadRequestException('Topic does not belong to the selected Chapter');
      map.set(String(row.topic_id), {
        boardId: String(row.board_id),
        classId: dto.classId,
        subjectId: dto.subjectId,
        chapterId: String(row.chapter_id),
        topicId: String(row.topic_id),
        className: String(row.class_name),
        subjectName: String(row.subject_name),
        chapterName: String(row.chapter_name),
        topicName: String(row.topic_name),
        topicDescription: row.topic_description ?? null,
      });
    }
    return map;
  }
}
