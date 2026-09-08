/**
 * PublicQuotesController unit tests - thin pass-throughs to the
 * quotes service.
 */
import { Test } from '@nestjs/testing';
import { PublicQuotesController } from './public-quotes.controller';
import { QuotesService } from './quotes.service';

describe('PublicQuotesController', () => {
  let ctrl: PublicQuotesController;
  let svc: any;

  beforeEach(async () => {
    svc = { getPublic: jest.fn(), approvePublic: jest.fn(), rejectPublic: jest.fn() };
    const mod = await Test.createTestingModule({
      controllers: [PublicQuotesController],
      providers: [{ provide: QuotesService, useValue: svc }],
    }).compile();
    ctrl = mod.get(PublicQuotesController);
  });

  it('get() delegates to getPublic', async () => {
    svc.getPublic.mockResolvedValue({ status: 'SENT' });
    const out = await ctrl.get('q1');
    expect(svc.getPublic).toHaveBeenCalledWith('q1');
    expect(out.status).toBe('SENT');
  });

  it('approve() passes the signature through', async () => {
    svc.approvePublic.mockResolvedValue({ status: 'APPROVED' });
    await ctrl.approve('q1', { signatureDataUrl: 'data:image/png;base64,AAA' } as any);
    expect(svc.approvePublic).toHaveBeenCalledWith('q1', 'data:image/png;base64,AAA');
  });

  it('reject() passes the optional reason through', async () => {
    svc.rejectPublic.mockResolvedValue({ status: 'REJECTED' });
    await ctrl.reject('q1', { reason: 'Too expensive' } as any);
    expect(svc.rejectPublic).toHaveBeenCalledWith('q1', 'Too expensive');
    await ctrl.reject('q1', {} as any);
    expect(svc.rejectPublic).toHaveBeenCalledWith('q1', undefined);
  });
});
