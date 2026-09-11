import { Global, Module } from '@nestjs/common';

import { AiSettingsService } from './ai-settings.service';
import { SecretStore } from './secret-store.service';

/**
 * Settings and secrets, global because almost everything reads them and
 * threading them through four module boundaries would obscure rather than
 * clarify who depends on what.
 *
 * Note what is *not* here: the settings controller. It lives with the agent
 * module, behind that module's auth guard, so there is no route into
 * configuration that bypasses authentication.
 */
@Global()
@Module({
  providers: [SecretStore, AiSettingsService],
  exports: [SecretStore, AiSettingsService],
})
export class AgentSettingsModule {}
