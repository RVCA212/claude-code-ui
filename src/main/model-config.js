const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ModelConfig {
  constructor() {
    this.currentModel = ''; // Empty string means default (Sonnet)
    this.modelConfigPath = path.join(os.homedir(), '.claude-code-chat', 'model-config.json');
  }

  // Load model configuration from storage
  async loadModelConfig() {
    try {
      const dir = path.dirname(this.modelConfigPath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.modelConfigPath, 'utf8');
      const config = JSON.parse(data);

      this.currentModel = config.model || '';

      // Set the environment variable
      if (this.currentModel) {
        process.env.ANTHROPIC_MODEL = this.currentModel;
        console.log('Model loaded from config:', this.currentModel);
      } else {
        delete process.env.ANTHROPIC_MODEL;
        console.log('Using default model (Sonnet)');
      }
    } catch (error) {
      // File doesn't exist or is invalid, use default
      console.log('No model config found, using default (Sonnet)');
      this.currentModel = '';
      delete process.env.ANTHROPIC_MODEL;
    }
  }

  // Save model configuration to storage
  async saveModelConfig() {
    try {
      const dir = path.dirname(this.modelConfigPath);
      await fs.mkdir(dir, { recursive: true });

      const config = {
        model: this.currentModel,
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(this.modelConfigPath, JSON.stringify(config, null, 2));
      console.log('Model config saved:', this.currentModel || 'Default (Sonnet)');
    } catch (error) {
      console.error('Failed to save model config:', error);
      throw error;
    }
  }

  // Get current model
  getCurrentModel() {
    return this.currentModel;
  }

  // Set current model
  async setCurrentModel(model) {
    if (model !== undefined && typeof model !== 'string') {
      throw new Error('Invalid model specification');
    }

    const validModels = ['', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514'];
    if (!validModels.includes(model)) {
      throw new Error(`Invalid model: ${model}. Valid models are: ${validModels.join(', ')}`);
    }

    this.currentModel = model || '';

    // Update environment variable
    if (this.currentModel) {
      process.env.ANTHROPIC_MODEL = this.currentModel;
    } else {
      delete process.env.ANTHROPIC_MODEL;
    }

    // Save to persistent storage
    await this.saveModelConfig();

    console.log('Model updated to:', this.currentModel || 'Default (Sonnet)');
    return this.currentModel;
  }
}

module.exports = ModelConfig;