import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Roles } from '../auth/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { TestAiDto } from './dto/test-ai.dto';

@Controller()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('api/settings/admin')
  @Roles('SUPER_ADMIN')
  getAdminSettings() {
    return this.settingsService.getAdminSettings();
  }

  @Patch('api/settings')
  @Roles('SUPER_ADMIN')
  patchSettings(@Body() body: UpdateSettingsDto) {
    return this.settingsService.patchSettings(body);
  }

  @Post('api/settings/test-ai')
  @Roles('SUPER_ADMIN')
  testAi(@Body() body: TestAiDto) {
    return this.settingsService.testAi(body);
  }
}
