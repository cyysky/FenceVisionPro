/**
 * RenderController unit tests.
 */
import { Test } from '@nestjs/testing';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';

describe('RenderController', () => {
  let ctrl: RenderController;
  let svc: any;

  beforeEach(async () => {
    svc = { compositeTopDown: jest.fn() };
    const mod = await Test.createTestingModule({
      controllers: [RenderController],
      providers: [{ provide: RenderService, useValue: svc }],
    }).compile();
    ctrl = mod.get(RenderController);
  });

  it('returns the composite URL under { url }', async () => {
    svc.compositeTopDown.mockResolvedValue('/static/renders/r.png');
    const dto = {
      floorPlanUrl: '/static/uploads/p.png',
      designOverlayUrl: '/static/overlays/o.png',
      fenceSegments: [{ x1: 0, y1: 0, x2: 5, y2: 0, lengthM: 5 }],
      floorPlanWidthM: 5,
      floorPlanHeightM: 3,
    };
    await expect(ctrl.render(dto as any)).resolves.toEqual({ url: '/static/renders/r.png' });
    expect(svc.compositeTopDown).toHaveBeenCalledWith(dto);
  });
});
