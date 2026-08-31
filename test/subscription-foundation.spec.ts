import { UserRole } from '../src/common/enums/user-role.enum';
import {
  EntitlementException,
  EntitlementService,
} from '../src/modules/subscriptions/entitlement.service';
import { EntitlementErrorCode, UsageMetric } from '../src/modules/subscriptions/subscription.enums';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'teacher@test.invalid',
  role: UserRole.TEACHER,
  schoolId: null,
  emailVerified: true,
};
const row = (overrides: Record<string, unknown> = {}) => ({
  subscription_id: '00000000-0000-4000-8000-000000000002',
  plan_id: '00000000-0000-4000-8000-000000000003',
  status: 'ACTIVE',
  current_period_start: new Date(Date.now() - 1000),
  current_period_end: new Date(Date.now() + 10000),
  is_active: true,
  limits: { aiQuestionsPerPeriod: 20 },
  ...overrides,
});
const service = (rows: unknown[]) =>
  new EntitlementService({ manager: { query: jest.fn().mockResolvedValue(rows) } } as never);

describe('subscription entitlement foundation', () => {
  it('resolves a finite active entitlement', async () =>
    expect(service([row()]).resolve(user)).resolves.toMatchObject({
      metric: UsageMetric.AI_QUESTIONS,
      limit: 20,
    }));
  it('uses null as the explicit unlimited representation', async () =>
    expect(
      service([row({ limits: { aiQuestionsPerPeriod: null } })]).resolve(user),
    ).resolves.toMatchObject({ limit: null }));
  it('denies missing subscriptions with a stable code', async () => {
    await expect(service([]).resolve(user)).rejects.toMatchObject({
      code: EntitlementErrorCode.NO_ACTIVE_SUBSCRIPTION,
    });
  });
  it.each(['PAST_DUE', 'CANCELLED', 'EXPIRED'])('denies %s subscriptions', async (status) => {
    await expect(service([row({ status })]).resolve(user)).rejects.toBeInstanceOf(
      EntitlementException,
    );
  });
  it('denies inactive plans', async () => {
    await expect(service([row({ is_active: false })]).resolve(user)).rejects.toMatchObject({
      code: EntitlementErrorCode.PLAN_INACTIVE,
    });
  });
  it('denies expired periods', async () => {
    await expect(
      service([row({ current_period_end: new Date(Date.now() - 1) })]).resolve(user),
    ).rejects.toMatchObject({ code: EntitlementErrorCode.SUBSCRIPTION_EXPIRED });
  });
});
