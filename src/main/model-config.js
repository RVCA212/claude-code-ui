const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ModelConfig {
  constructor() {
    this.currentModel = ''; // Empty string means default (Sonnet)
    this.taskTemplate = 'Create a new folder in the cwd and accomplish the following task into it: \n\n<task>\n\n</task> ultrathink through this task to complete it effectively:';

    // System prompt settings
    this.systemPrompt = '';
    this.systemPromptEnabled = false;
    this.systemPromptMode = 'append'; // 'append' or 'override'

    // Window detection settings
    this.windowDetectionSettings = {
      vscode: true,    // default on
      cursor: true,    // default on
      excel: false,    // default off
      photoshop: false // default off
    };

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
      this.taskTemplate = config.taskTemplate || 'Create a new folder in the cwd and accomplish the following task into it: \n\n<task>\n\n</task> ultrathink through this task to complete it effectively:';

      // Load system prompt settings
      this.systemPrompt = config.systemPrompt || '';
      this.systemPromptEnabled = typeof config.systemPromptEnabled === 'boolean' ? config.systemPromptEnabled : false;
      this.systemPromptMode = config.systemPromptMode || 'append';

      // Load window detection settings
      this.windowDetectionSettings = {
        vscode: typeof config.windowDetectionSettings?.vscode === 'boolean' ? config.windowDetectionSettings.vscode : true,
        cursor: typeof config.windowDetectionSettings?.cursor === 'boolean' ? config.windowDetectionSettings.cursor : true,
        excel: typeof config.windowDetectionSettings?.excel === 'boolean' ? config.windowDetectionSettings.excel : false,
        photoshop: typeof config.windowDetectionSettings?.photoshop === 'boolean' ? config.windowDetectionSettings.photoshop : false
      };

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
      this.taskTemplate = 'Create a new folder in the cwd and accomplish the following task into it: \n\n<task>\n\n</task> ultrathink through this task to complete it effectively:';

      // Default system prompt settings
      this.systemPrompt = '';
      this.systemPromptEnabled = false;
      this.systemPromptMode = 'append';

      // Default window detection settings
      this.windowDetectionSettings = {
        vscode: true,
        cursor: true,
        excel: false,
        photoshop: false
      };

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
        taskTemplate: this.taskTemplate,
        systemPrompt: this.systemPrompt,
        systemPromptEnabled: this.systemPromptEnabled,
        systemPromptMode: this.systemPromptMode,
        windowDetectionSettings: this.windowDetectionSettings,
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

  // Get current task template
  getTaskTemplate() {
    return this.taskTemplate;
  }

  // Set current task template
  async setTaskTemplate(template) {
    if (typeof template !== 'string') {
      throw new Error('Task template must be a string');
    }

    this.taskTemplate = template;

    // Save to persistent storage
    await this.saveModelConfig();

    console.log('Task template updated');
    return this.taskTemplate;
  }

  // --- System Prompt Methods ---

  getSystemPromptConfig() {
    return {
      prompt: this.systemPrompt,
      enabled: this.systemPromptEnabled,
      mode: this.systemPromptMode,
    };
  }

  async setSystemPromptConfig(config) {
    if (config.prompt !== undefined && typeof config.prompt === 'string') {
      this.systemPrompt = config.prompt;
    }
    if (config.enabled !== undefined && typeof config.enabled === 'boolean') {
      this.systemPromptEnabled = config.enabled;
    }
    if (config.mode === 'append' || config.mode === 'override') {
      this.systemPromptMode = config.mode;
    }

    await this.saveModelConfig();
    console.log('System prompt config updated');
    return this.getSystemPromptConfig();
  }

  // Get window detection settings
  getWindowDetectionSettings() {
    return {
      vscode: this.windowDetectionSettings.vscode,
      cursor: this.windowDetectionSettings.cursor,
      excel: this.windowDetectionSettings.excel,
      photoshop: this.windowDetectionSettings.photoshop
    };
  }

  // Set window detection settings
  async setWindowDetectionSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid window detection settings');
    }

    // Update settings with validation
    if (typeof settings.vscode === 'boolean') {
      this.windowDetectionSettings.vscode = settings.vscode;
    }
    if (typeof settings.cursor === 'boolean') {
      this.windowDetectionSettings.cursor = settings.cursor;
    }
    if (typeof settings.excel === 'boolean') {
      this.windowDetectionSettings.excel = settings.excel;
    }
    if (typeof settings.photoshop === 'boolean') {
      this.windowDetectionSettings.photoshop = settings.photoshop;
    }

    await this.saveModelConfig();
    console.log('Window detection settings updated:', this.windowDetectionSettings);
    return this.getWindowDetectionSettings();
  }
}

module.exports = ModelConfig;