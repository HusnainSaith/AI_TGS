import { ReportingService } from '../src/modules/reporting/reporting.service';
import { UserRole } from '../src/common/enums/user-role.enum';

describe('ReportingService', () => {
  it('returns authoritative current-cycle counters and storage categories', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'sub',
          schoolId: 'school',
          periodStart: new Date('2026-09-01Z'),
          periodEnd: new Date('2026-10-01Z'),
          planName: 'School',
          limits: {
            aiQuestionsPerPeriod: 100,
            testsPerPeriod: 10,
            pdfExportsPerPeriod: 20,
            storageBytes: 1000,
          },
        },
      ])
      .mockResolvedValueOnce([
        { metric: 'AI_QUESTIONS', used: '20', reserved: '5' },
        { metric: 'TESTS', used: '2', reserved: '1' },
      ])
      .mockResolvedValueOnce([{ documents: '400', pdfExports: '100' }]);
    const service = new ReportingService({ query } as never);
    const result = await service.currentCycle({
      id: 'admin',
      email: 'a@b.test',
      role: UserRole.SCHOOL_ADMIN,
      schoolId: 'school',
      emailVerified: true,
    });
    expect(result.scope).toBe('SCHOOL');
    expect(result.usage.aiQuestions).toEqual({ limit: 100, used: 20, reserved: 5, remaining: 75 });
    expect(result.usage.pdfExports!.used).toBe(0);
    expect(result.storage).toMatchObject({
      limit: 1000,
      used: 500,
      remaining: 500,
      categories: { documents: 400, pdfExports: 100 },
    });
    expect(query.mock.calls[2]![1]).toEqual(['school', 'admin']);
  });
});
