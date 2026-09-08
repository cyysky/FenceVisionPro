/**
 * DesignsController unit tests - open list/get for any authed user,
 * admin-only create with designProducts linking.
 */
import { Test } from '@nestjs/testing';
import { DesignsController } from './designs.controller';
import { DesignsService } from './designs.service';

describe('DesignsController', () => {
  let ctrl: DesignsController;
  let svc: any;

  beforeEach(async () => {
    svc = { list: jest.fn(), get: jest.fn(), create: jest.fn() };
    const mod = await Test.createTestingModule({
      controllers: [DesignsController],
      providers: [{ provide: DesignsService, useValue: svc }],
    }).compile();
    ctrl = mod.get(DesignsController);
  });

  it('list/get delegate', async () => {
    svc.list.mockResolvedValue([]);
    svc.get.mockResolvedValue({ id: 'd1' });
    await ctrl.list();
    await ctrl.get('d1');
    expect(svc.list).toHaveBeenCalled();
    expect(svc.get).toHaveBeenCalledWith('d1');
  });

  it('create() without productIds stores an empty config and no links', async () => {
    svc.create.mockResolvedValue({ id: 'd1' });
    await ctrl.create({ name: 'Picket', style: 'Picket', overlayUrl: '/static/o.png' } as any);
    expect(svc.create).toHaveBeenCalledWith({
      name: 'Picket',
      style: 'Picket',
      overlayUrl: '/static/o.png',
      config: {},
      designProducts: undefined,
    });
  });

  it('create() expands productIds into designProducts with default coverage 2.4', async () => {
    svc.create.mockResolvedValue({ id: 'd1' });
    await ctrl.create({
      name: 'Picket', style: 'Picket', overlayUrl: '/static/o.png',
      productIds: ['p1', 'p2'],
    } as any);
    expect(svc.create).toHaveBeenCalledWith({
      name: 'Picket',
      style: 'Picket',
      overlayUrl: '/static/o.png',
      config: {},
      designProducts: { create: [
        { productId: 'p1', coverage: 2.4 },
        { productId: 'p2', coverage: 2.4 },
      ] },
    });
  });
});
