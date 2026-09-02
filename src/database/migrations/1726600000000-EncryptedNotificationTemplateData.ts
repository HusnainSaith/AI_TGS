import { MigrationInterface, QueryRunner } from 'typeorm';

export class EncryptedNotificationTemplateData1726600000000 implements MigrationInterface {
  name = 'EncryptedNotificationTemplateData1726600000000';

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(
      `ALTER TABLE notification_deliveries ADD COLUMN encrypted_template_data text`,
    );
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(
      `ALTER TABLE notification_deliveries DROP COLUMN encrypted_template_data`,
    );
  }
}
