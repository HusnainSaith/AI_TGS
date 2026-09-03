import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../src/common/enums/user-role.enum';
import {
  QuestionReviewStatus,
  QuestionStatus,
  QuestionVisibility,
} from '../src/modules/questions/enums/question.enums';
import { SchoolGovernanceService } from '../src/modules/schools/school-governance.service';
import { TestsService } from '../src/modules/tests/tests.service';

describe('school governance tenant policy', () => {
  const admin = {
    id: 'admin',
    email: 'admin@example.test',
    role: UserRole.SCHOOL_ADMIN,
    schoolId: 'school-a',
    emailVerified: true,
  };
  it('looks up a teacher using both teacher role and actor school', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const service = new SchoolGovernanceService(
      {} as never,
      { findOne } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.teacher('teacher-b', admin)).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne.mock.calls[0]![0].where).toEqual({
      id: 'teacher-b',
      schoolId: 'school-a',
      role: UserRole.TEACHER,
    });
  });
  it('allows same-school published questions in Test Builder and rejects cross-school substitution', () => {
    const service = new TestsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const question = {
      createdBy: 'other',
      visibility: QuestionVisibility.SCHOOL,
      sharedSchoolId: 'school-a',
      reviewStatus: QuestionReviewStatus.APPROVED,
      status: QuestionStatus.ACTIVE,
      classId: 'class',
      subjectId: 'subject',
      source: 'MANUAL',
    };
    const test = { classId: 'class', subjectId: 'subject' };
    expect(() => service['eligible'](question as never, test as never, admin, false)).not.toThrow();
    expect(() =>
      service['eligible'](
        { ...question, sharedSchoolId: 'school-b' } as never,
        test as never,
        admin,
        false,
      ),
    ).toThrow(ForbiddenException);
  });
});
