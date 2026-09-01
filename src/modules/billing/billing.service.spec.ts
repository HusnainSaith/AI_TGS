import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PaymentProvider } from '../../infrastructure/providers/provider.contracts';
import { Plan } from '../subscriptions/entities/plan.entity';
import { SubscriptionStatus } from '../subscriptions/subscription.enums';
import {
  BillingCheckoutSession,
  BillingCustomer,
  BillingEvent,
  PlanProviderPrice,
} from './billing.entities';
import { BillingService } from './billing.service';
import { BillingProviderError } from './billing-provider.error';

describe('BillingService reconciliation', () => {
  const remote = {
    providerSubscriptionId: 'sub_remote',
    providerPlanId: 'plan_remote',
    providerCustomerId: 'customer_remote',
    status: 'ACTIVE' as const,
    currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    providerUpdatedAt: new Date('2026-08-20T00:00:00.000Z'),
  };

  function setup(providerUpdatedAt = new Date('2026-08-10T00:00:00.000Z')) {
    const getSubscription = jest.fn().mockResolvedValue(remote);
    const provider = {
      name: 'safepay',
      requiresCustomer: false,
      capabilities: {
        checkout: 'SUPPORTED',
        customerCreation: 'UNSUPPORTED',
        portal: 'UNSUPPORTED',
        cancellation: 'SUPPORTED',
        planChange: 'UNSUPPORTED',
        subscriptionRetrieval: 'SUPPORTED',
        reconciliation: 'SUPPORTED',
      },
      getSubscription,
    } as unknown as PaymentProvider;
    const managerQuery = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'local-id',
          planId: 'old-plan',
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          providerCustomerId: null,
          providerStateUpdatedAt: providerUpdatedAt,
        },
      ])
      .mockResolvedValueOnce([]);
    const manager = {
      query: managerQuery,
      getRepository: jest.fn().mockReturnValue({
        findOneBy: jest.fn().mockResolvedValue({ planId: 'mapped-plan' }),
      }),
    } as unknown as EntityManager;
    const transaction = jest.fn((callback: (value: EntityManager) => unknown) =>
      Promise.resolve(callback(manager)),
    );
    const data = {
      query: jest.fn().mockResolvedValue([
        {
          id: 'local-id',
          providerSubscriptionId: 'sub_remote',
          providerStateUpdatedAt: providerUpdatedAt,
        },
      ]),
      transaction,
    } as unknown as DataSource;
    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const audit = { record: auditRecord } as unknown as AuditService;
    const service = new BillingService(
      {} as Repository<Plan>,
      {} as Repository<PlanProviderPrice>,
      {} as Repository<BillingCustomer>,
      {} as Repository<BillingCheckoutSession>,
      {} as Repository<BillingEvent>,
      data,
      {
        get: (key: string) => (key === 'billing.provider' ? 'safepay' : undefined),
      } as ConfigService,
      provider,
      audit,
    );
    return { service, data, managerQuery, getSubscription, auditRecord, transaction };
  }

  it('fetches provider state before its short write transaction and updates commercial fields', async () => {
    const { service, data, managerQuery, getSubscription, auditRecord } = setup();
    const result = await service.reconcile();
    expect(getSubscription).toHaveBeenCalledWith('sub_remote');
    expect(getSubscription.mock.invocationCallOrder[0]).toBeLessThan(
      (data.transaction as jest.Mock).mock.invocationCallOrder[0]!,
    );
    expect(managerQuery.mock.calls[1][0]).toContain('UPDATE subscriptions');
    expect(managerQuery.mock.calls[1][0]).not.toMatch(/usage|entitlement/i);
    expect(managerQuery.mock.calls[1][1]).toEqual(
      expect.arrayContaining([
        'local-id',
        'mapped-plan',
        SubscriptionStatus.ACTIVE,
        remote.currentPeriodStart,
        remote.currentPeriodEnd,
        false,
        null,
        'customer_remote',
        remote.providerUpdatedAt,
      ]),
    );
    expect(auditRecord).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ checked: 1, updated: 1, failed: 0 }));
  });

  it('does not let stale provider state overwrite a newer webhook state', async () => {
    const { service, managerQuery, auditRecord } = setup(new Date('2026-08-25T00:00:00.000Z'));
    const result = await service.reconcile();
    expect(managerQuery).toHaveBeenCalledTimes(1);
    expect(auditRecord).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ stale: 1, updated: 0 }));
  });

  it('leaves an already synchronized subscription unchanged', async () => {
    const { service, managerQuery, auditRecord } = setup(remote.providerUpdatedAt);
    managerQuery.mockReset().mockResolvedValueOnce([
      {
        id: 'local-id',
        planId: 'mapped-plan',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: remote.currentPeriodStart,
        currentPeriodEnd: remote.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        providerCustomerId: 'customer_remote',
        providerStateUpdatedAt: remote.providerUpdatedAt,
      },
    ]);
    const result = await service.reconcile();
    expect(managerQuery).toHaveBeenCalledTimes(1);
    expect(auditRecord).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ unchanged: 1, updated: 0 }));
  });

  it.each(['BILLING_SUBSCRIPTION_NOT_FOUND', 'BILLING_PROVIDER_TIMEOUT'] as const)(
    'reports provider %s without opening a write transaction',
    async (code) => {
      const { service, getSubscription, transaction } = setup();
      getSubscription.mockRejectedValueOnce(new BillingProviderError(code, 'safe message'));
      const result = await service.reconcile();
      expect(transaction).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ failed: 1, updated: 0 }));
      expect(result.results[0]).toEqual(expect.objectContaining({ errorCode: code }));
    },
  );
});
