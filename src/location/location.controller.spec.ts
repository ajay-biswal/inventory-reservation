import { Test, TestingModule } from '@nestjs/testing';
import { LocationController } from './location.controller.js';
import { LocationService } from './location.service.js';

describe('LocationController', () => {
  let controller: LocationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationController],
      providers:[
        {
          provide:LocationService,
          useValue:{}
        }
      ]
    }).compile();

    controller = module.get<LocationController>(LocationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
