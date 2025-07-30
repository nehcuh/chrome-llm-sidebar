/**
 * Prompt管理器
 * 管理Prompt模板的创建、更新、删除和智能匹配
 */
class PromptManager {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.prompts = [];
        this.initialized = false;
        this.listeners = new Map(); // 事件监听器
        this.builtinPrompts = this.createBuiltinPrompts();
    }

    /**
     * 初始化Prompt管理器
     */
    async init() {
        if (this.initialized) {
            return;
        }

        try {
            await this.dbManager.init();
            await this.loadPrompts();
            await this.ensureBuiltinPrompts();
            this.initialized = true;
            console.log('PromptManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize PromptManager:', error);
            throw error;
        }
    }

    /**
     * 创建内置Prompt模板
     */
    createBuiltinPrompts() {
        return [
            {
                id: 'prompt_code_review',
                name: '代码审查助手',
                description: '专业的代码审查和优化建议',
                category: 'programming',
                tags: ['代码审查', '优化', '质量'],
                template: `你是一个经验丰富的代码审查专家，请帮我审查以下代码：

{code}

请从以下几个方面进行分析：
1. 代码质量和可读性
2. 性能优化建议
3. 安全性问题
4. 最佳实践建议
5. 潜在的bug风险

请提供具体的改进建议和示例代码。`,
                variables: [
                    {
                        name: 'code',
                        type: 'textarea',
                        description: '需要审查的代码',
                        required: true
                    }
                ],
                autoSelect: true,
                confidenceThreshold: 0.7,
                usageCount: 0,
                rating: 4.5
            },
            {
                id: 'prompt_debug_helper',
                name: '调试助手',
                description: '帮助分析和解决代码问题',
                category: 'programming',
                tags: ['调试', '错误', '问题解决'],
                template: `我遇到了一个编程问题，请帮我分析和解决：

问题描述：{problem}

错误信息：{error}

相关代码：{code}

请帮我：
1. 分析问题的可能原因
2. 提供解决方案
3. 给出预防措施`,
                variables: [
                    {
                        name: 'problem',
                        type: 'text',
                        description: '问题描述',
                        required: true
                    },
                    {
                        name: 'error',
                        type: 'text',
                        description: '错误信息',
                        required: false
                    },
                    {
                        name: 'code',
                        type: 'textarea',
                        description: '相关代码',
                        required: false
                    }
                ],
                autoSelect: true,
                confidenceThreshold: 0.6,
                usageCount: 0,
                rating: 4.3
            },
            {
                id: 'prompt_content_writer',
                name: '内容创作助手',
                description: '帮助创作各种类型的内容',
                category: 'content',
                tags: ['写作', '创作', '文案'],
                template: `请帮我创作一篇{type}内容：

主题：{topic}
目标受众：{audience}
风格要求：{style}
字数要求：{word_count}

请确保内容：
1. 结构清晰，逻辑性强
2. 语言生动，吸引读者
3. 符合目标受众的需求
4. 体现指定的风格特点`,
                variables: [
                    {
                        name: 'type',
                        type: 'select',
                        description: '内容类型',
                        options: ['文章', '博客', '广告文案', '产品介绍', '教程'],
                        default: '文章',
                        required: true
                    },
                    {
                        name: 'topic',
                        type: 'text',
                        description: '主题',
                        required: true
                    },
                    {
                        name: 'audience',
                        type: 'text',
                        description: '目标受众',
                        required: true
                    },
                    {
                        name: 'style',
                        type: 'text',
                        description: '风格要求',
                        required: false
                    },
                    {
                        name: 'word_count',
                        type: 'number',
                        description: '字数要求',
                        required: false
                    }
                ],
                autoSelect: true,
                confidenceThreshold: 0.5,
                usageCount: 0,
                rating: 4.2
            },
            {
                id: 'prompt_data_analyst',
                name: '数据分析助手',
                description: '帮助分析数据和提供洞察',
                category: 'analysis',
                tags: ['数据', '分析', '统计'],
                template: `我有一份数据需要分析，请帮我提供专业的数据分析：

数据描述：{data_description}
分析目标：{analysis_goal}
数据格式：{data_format}

请帮我：
1. 理解数据结构和特征
2. 选择合适的分析方法
3. 提供分析步骤和建议
4. 解释可能的结果和含义`,
                variables: [
                    {
                        name: 'data_description',
                        type: 'textarea',
                        description: '数据描述',
                        required: true
                    },
                    {
                        name: 'analysis_goal',
                        type: 'text',
                        description: '分析目标',
                        required: true
                    },
                    {
                        name: 'data_format',
                        type: 'select',
                        description: '数据格式',
                        options: ['CSV', 'JSON', 'Excel', '数据库表', '文本'],
                        default: 'CSV',
                        required: true
                    }
                ],
                autoSelect: true,
                confidenceThreshold: 0.6,
                usageCount: 0,
                rating: 4.4
            },
            {
                id: 'prompt_translation_helper',
                name: '翻译助手',
                description: '专业的翻译服务',
                category: 'language',
                tags: ['翻译', '语言', '多语言'],
                template: `请帮我将以下文本从{source_language}翻译成{target_language}：

原文：{text}

翻译要求：
1. 保持原文的含义和语气
2. 符合目标语言的表达习惯
3. 专业术语准确翻译
4. 文化差异适当调整

请提供翻译结果和必要的解释。`,
                variables: [
                    {
                        name: 'source_language',
                        type: 'select',
                        description: '源语言',
                        options: ['中文', '英语', '日语', '韩语', '法语', '德语', '西班牙语'],
                        default: '中文',
                        required: true
                    },
                    {
                        name: 'target_language',
                        type: 'select',
                        description: '目标语言',
                        options: ['英语', '中文', '日语', '韩语', '法语', '德语', '西班牙语'],
                        default: '英语',
                        required: true
                    },
                    {
                        name: 'text',
                        type: 'textarea',
                        description: '要翻译的文本',
                        required: true
                    }
                ],
                autoSelect: true,
                confidenceThreshold: 0.5,
                usageCount: 0,
                rating: 4.1
            }
        ];
    }

    /**
     * 加载所有Prompt
     */
    async loadPrompts() {
        try {
            this.prompts = await this.dbManager.getAllPrompts();
            console.log(`Loaded ${this.prompts.length} prompts`);
        } catch (error) {
            console.error('Failed to load prompts:', error);
            throw error;
        }
    }

    /**
     * 确保内置Prompt存在
     */
    async ensureBuiltinPrompts() {
        try {
            for (const builtinPrompt of this.builtinPrompts) {
                const existingPrompt = this.prompts.find(p => p.id === builtinPrompt.id);
                if (!existingPrompt) {
                    await this.createPrompt(builtinPrompt);
                } else {
                    // 更新内置Prompt的模板（如果需要）
                    if (existingPrompt.template !== builtinPrompt.template) {
                        await this.updatePrompt(existingPrompt.id, { template: builtinPrompt.template });
                    }
                }
            }
        } catch (error) {
            console.error('Failed to ensure builtin prompts:', error);
            throw error;
        }
    }

    /**
     * 创建Prompt
     */
    async createPrompt(promptData) {
        try {
            const prompt = {
                ...promptData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                usageCount: promptData.usageCount || 0,
                rating: promptData.rating || 0
            };

            await this.dbManager.savePrompt(prompt);
            this.prompts.push(prompt);
            
            // 更新搜索索引
            await this.updatePromptSearchIndex(prompt);
            
            // 触发事件
            this.emit('promptCreated', prompt);
            
            console.log(`Created prompt: ${prompt.id}`);
            return prompt;
        } catch (error) {
            console.error('Failed to create prompt:', error);
            throw error;
        }
    }

    /**
     * 更新Prompt
     */
    async updatePrompt(promptId, updates) {
        try {
            const promptIndex = this.prompts.findIndex(p => p.id === promptId);
            if (promptIndex === -1) {
                throw new Error(`Prompt not found: ${promptId}`);
            }

            const prompt = this.prompts[promptIndex];
            const updatedPrompt = {
                ...prompt,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            await this.dbManager.savePrompt(updatedPrompt);
            this.prompts[promptIndex] = updatedPrompt;
            
            // 更新搜索索引
            await this.updatePromptSearchIndex(updatedPrompt);
            
            // 触发事件
            this.emit('promptUpdated', updatedPrompt);
            
            console.log(`Updated prompt: ${promptId}`);
            return updatedPrompt;
        } catch (error) {
            console.error('Failed to update prompt:', error);
            throw error;
        }
    }

    /**
     * 删除Prompt
     */
    async deletePrompt(promptId) {
        try {
            const promptIndex = this.prompts.findIndex(p => p.id === promptId);
            if (promptIndex === -1) {
                throw new Error(`Prompt not found: ${promptId}`);
            }

            const prompt = this.prompts[promptIndex];
            
            // 不允许删除内置Prompt
            if (this.builtinPrompts.find(bp => bp.id === promptId)) {
                throw new Error('Cannot delete builtin prompt');
            }

            await this.dbManager.deletePrompt(promptId);
            this.prompts.splice(promptIndex, 1);
            
            // 触发事件
            this.emit('promptDeleted', prompt);
            
            console.log(`Deleted prompt: ${promptId}`);
        } catch (error) {
            console.error('Failed to delete prompt:', error);
            throw error;
        }
    }

    /**
     * 获取Prompt
     */
    getPrompt(promptId) {
        return this.prompts.find(p => p.id === promptId);
    }

    /**
     * 获取所有Prompt
     */
    getAllPrompts() {
        return [...this.prompts];
    }

    /**
     * 按分类获取Prompt
     */
    getPromptsByCategory(category) {
        return this.prompts.filter(p => p.category === category);
    }

    /**
     * 获取可自动选择的Prompt
     */
    getAutoSelectPrompts() {
        return this.prompts.filter(p => p.autoSelect);
    }

    /**
     * 搜索Prompt
     */
    async searchPrompts(query, options = {}) {
        try {
            const results = await this.dbManager.searchPrompts(query, options);
            return results;
        } catch (error) {
            console.error('Failed to search prompts:', error);
            throw error;
        }
    }

    /**
     * 智能匹配Prompt
     */
    async matchPrompts(userInput, options = {}) {
        try {
            const { minConfidence = 0.3, maxResults = 5 } = options;
            const autoSelectPrompts = this.getAutoSelectPrompts();
            
            const matches = [];
            
            for (const prompt of autoSelectPrompts) {
                const confidence = this.calculateConfidence(userInput, prompt);
                if (confidence >= minConfidence) {
                    matches.push({
                        prompt,
                        confidence,
                        matchedKeywords: this.extractMatchedKeywords(userInput, prompt)
                    });
                }
            }
            
            // 按置信度排序
            matches.sort((a, b) => b.confidence - a.confidence);
            
            return matches.slice(0, maxResults);
        } catch (error) {
            console.error('Failed to match prompts:', error);
            throw error;
        }
    }

    /**
     * 计算匹配置信度
     */
    calculateConfidence(userInput, prompt) {
        const input = userInput.toLowerCase();
        let confidence = 0;
        
        // 名称匹配 (权重: 0.4)
        if (input.includes(prompt.name.toLowerCase())) {
            confidence += 0.4;
        }
        
        // 描述匹配 (权重: 0.3)
        if (input.includes(prompt.description.toLowerCase())) {
            confidence += 0.3;
        }
        
        // 标签匹配 (权重: 0.2)
        const tagMatches = prompt.tags.filter(tag => 
            input.includes(tag.toLowerCase())
        ).length;
        confidence += (tagMatches / prompt.tags.length) * 0.2;
        
        // 模板关键词匹配 (权重: 0.1)
        const templateKeywords = this.extractKeywords(prompt.template);
        const keywordMatches = templateKeywords.filter(keyword => 
            input.includes(keyword)
        ).length;
        confidence += (keywordMatches / templateKeywords.length) * 0.1;
        
        // 应用置信度阈值调整
        if (prompt.confidenceThreshold) {
            confidence = Math.max(0, confidence - (1 - prompt.confidenceThreshold));
        }
        
        return Math.min(1, confidence);
    }

    /**
     * 提取关键词
     */
    extractKeywords(text) {
        if (!text) return [];
        
        // 移除变量占位符
        const cleanText = text.replace(/\{[^}]*\}/g, ' ');
        
        // 简单的中英文分词
        const words = cleanText
            .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 1);
        
        return [...new Set(words)];
    }

    /**
     * 提取匹配的关键词
     */
    extractMatchedKeywords(userInput, prompt) {
        const input = userInput.toLowerCase();
        const keywords = [];
        
        // 检查名称关键词
        if (input.includes(prompt.name.toLowerCase())) {
            keywords.push(prompt.name);
        }
        
        // 检查标签关键词
        prompt.tags.forEach(tag => {
            if (input.includes(tag.toLowerCase())) {
                keywords.push(tag);
            }
        });
        
        return keywords;
    }

    /**
     * 使用Prompt
     */
    async usePrompt(promptId, variables = {}) {
        try {
            const prompt = this.getPrompt(promptId);
            if (!prompt) {
                throw new Error(`Prompt not found: ${promptId}`);
            }
            
            // 渲染模板
            const renderedTemplate = this.renderTemplate(prompt.template, variables);
            
            // 更新使用次数
            await this.updatePrompt(promptId, { 
                usageCount: (prompt.usageCount || 0) + 1 
            });
            
            // 触发事件
            this.emit('promptUsed', { prompt, variables, renderedTemplate });
            
            return {
                prompt,
                renderedTemplate,
                variables
            };
        } catch (error) {
            console.error('Failed to use prompt:', error);
            throw error;
        }
    }

    /**
     * 渲染模板
     */
    renderTemplate(template, variables) {
        let rendered = template;
        
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{${key}}`;
            rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
        }
        
        return rendered;
    }

    /**
     * 获取Prompt分类
     */
    getCategories() {
        const categories = [...new Set(this.prompts.map(p => p.category))];
        return categories.sort();
    }

    /**
     * 获取所有标签
     */
    getTags() {
        const allTags = this.prompts.flatMap(p => p.tags || []);
        const uniqueTags = [...new Set(allTags)];
        return uniqueTags.sort();
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const stats = {
            totalPrompts: this.prompts.length,
            builtinPrompts: this.builtinPrompts.length,
            customPrompts: this.prompts.length - this.builtinPrompts.length,
            categories: this.getCategories(),
            tags: this.getTags(),
            totalUsage: this.prompts.reduce((sum, p) => sum + (p.usageCount || 0), 0),
            autoSelectCount: this.prompts.filter(p => p.autoSelect).length
        };
        
        return stats;
    }

    /**
     * 更新Prompt搜索索引
     */
    async updatePromptSearchIndex(prompt) {
        try {
            const content = [
                prompt.name,
                prompt.description,
                prompt.template,
                ...(prompt.tags || [])
            ].join(' ');
            
            await this.dbManager.updateSearchIndex('prompt', prompt.id, content);
        } catch (error) {
            console.error('Failed to update prompt search index:', error);
        }
    }

    /**
     * 事件监听器管理
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Event listener error for ${event}:`, error);
                }
            });
        }
    }

    /**
     * 销毁Prompt管理器
     */
    async destroy() {
        try {
            this.listeners.clear();
            this.prompts = [];
            this.initialized = false;
            console.log('PromptManager destroyed');
        } catch (error) {
            console.error('Failed to destroy PromptManager:', error);
            throw error;
        }
    }
}

// 导出PromptManager类
window.PromptManager = PromptManager;