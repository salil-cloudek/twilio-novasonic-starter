/**
 * Centralized application configuration
 * Validates and provides typed access to all environment variables and settings
 */

import { InferenceConfig } from '../types/SharedTypes';
import { DefaultInferenceConfiguration } from '../utils/constants';

export interface AppConfig {
  server: {
    port: number;
    host?: string;
  };
  aws: {
    region: string;
    profileName?: string;
  };
  bedrock: {
    region: string;
    modelId: string;
  };
  twilio: {
    authToken: string;
  };
  logging: {
    level: string;
  };
  inference: InferenceConfig;
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    // Validate required environment variables
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (!twilioAuthToken) {
      throw new Error('TWILIO_AUTH_TOKEN environment variable is required');
    }

    const config = {
      server: {
        port: parseInt(process.env.PORT || '8080', 10),
        host: process.env.HOST,
      },
      aws: {
        region: process.env.AWS_REGION || 'us-east-1',
        profileName: process.env.AWS_PROFILE_NAME,
      },
      bedrock: {
        region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
        modelId: process.env.BEDROCK_MODEL_ID || 'amazon.nova-sonic-v1:0',
      },
      twilio: {
        authToken: twilioAuthToken.trim().replace(/^"(.*)"$/, '$1'),
      },
      logging: {
        level: process.env.LOG_LEVEL || 'INFO',
      },
      inference: {
        maxTokens: parseInt(process.env.MAX_TOKENS || String(DefaultInferenceConfiguration.maxTokens), 10),
        topP: parseFloat(process.env.TOP_P || String(DefaultInferenceConfiguration.topP)),
        temperature: parseFloat(process.env.TEMPERATURE || String(DefaultInferenceConfiguration.temperature)),
      },
    };

    // Log Bedrock configuration
    console.log('Bedrock configuration loaded:', {
      bedrockRegion: config.bedrock.region,
      bedrockModelId: config.bedrock.modelId,
      awsRegion: config.aws.region
    });

    return config;
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public get server() { return this.config.server; }
  public get aws() { return this.config.aws; }
  public get bedrock() { return this.config.bedrock; }
  public get twilio() { return this.config.twilio; }
  public get logging() { return this.config.logging; }
  public get inference() { return this.config.inference; }
}

export const config = ConfigManager.getInstance();
export default config;