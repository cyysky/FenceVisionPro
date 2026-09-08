/**
 * ProductsController unit tests - tenant-aware list/get and the
 * admin-only override routes (mocked service).
 */
import { Test } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Role } from '@prisma/client';

describe('ProductsController', () => {
  let ctrl: ProductsController;
  let svc: any;
  const admin = { sub: 'a', role: Role.ADMIN, dealerId: null } as any;
  const dealer = { sub: 'd', role: Role.DEALER_OWNER, dealerId: 'w1' } as any;

  beforeEach(async () => {
    svc = {
      listForDealer: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setOverride: jest.fn(),
      clearOverride: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: svc }],
    }).compile();
    ctrl = mod.get(ProductsController);
  });

  it('list() passes null dealerId for admins so overrides are skipped', async () => {
    svc.listForDealer.mockResolvedValue([]);
    await ctrl.list(admin);
    expect(svc.listForDealer).toHaveBeenCalledWith(null);
  });

  it('list() passes the caller dealerId for dealer users', async () => {
    svc.listForDealer.mockResolvedValue([]);
    await ctrl.list(dealer);
    expect(svc.listForDealer).toHaveBeenCalledWith('w1');
  });

  it('get() scopes the price lookup by role', async () => {
    svc.get.mockResolvedValue({});
    await ctrl.get('p1', dealer);
    expect(svc.get).toHaveBeenCalledWith('p1', 'w1');
    await ctrl.get('p1', admin);
    expect(svc.get).toHaveBeenCalledWith('p1', null);
  });

  it('setOverride() routes the price and returns the upserted row', async () => {
    svc.setOverride.mockResolvedValue({ id: 'o1' });
    const out = await ctrl.setOverride('p1', 'w1', { price: 88 } as any);
    expect(svc.setOverride).toHaveBeenCalledWith('w1', 'p1', 88);
    expect(out.id).toBe('o1');
  });

  it('clearOverride() routes and returns removed flag', async () => {
    svc.clearOverride.mockResolvedValue({ ok: true, removed: true });
    await expect(ctrl.clearOverride('p1', 'w1')).resolves.toEqual({ ok: true, removed: true });
    expect(svc.clearOverride).toHaveBeenCalledWith('w1', 'p1');
  });

  it('create/update delegate the DTO', async () => {
    svc.create.mockResolvedValue({ id: 'p9' });
    svc.update.mockResolvedValue({ id: 'p9' });
    const dto = { sku: 'S', name: 'N', category: 'C', unit: 'pcs', basePrice: 1, heightOptions: [], colorOptions: [] } as any;
    await ctrl.create(dto);
    await ctrl.update('p9', dto);
    expect(svc.create).toHaveBeenCalledWith(dto);
    expect(svc.update).toHaveBeenCalledWith('p9', dto);
  });
});
