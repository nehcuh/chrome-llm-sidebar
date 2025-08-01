/**
 * 富媒体渲染管理器
 * 支持Markdown、HTML、Mermaid图表、代码高亮、数学公式等功能
 */
class RichMediaRenderer {
    constructor() {
        this.initialized = false;
        this.copyButtons = new Map(); // 存储复制按钮的引用
        this.mermaidInitialized = false;
        this.init();
    }

    /**
     * 初始化渲染器
     */
    async init() {
        if (this.initialized) {
            return;
        }

        try {
            // 配置marked选项
            this.configureMarked();
            
            // 初始化Mermaid
            await this.initMermaid();
            
            // 配置KaTeX
            this.configureKaTeX();
            
            this.initialized = true;
            console.log('RichMediaRenderer initialized successfully');
        } catch (error) {
            console.error('Failed to initialize RichMediaRenderer:', error);
        }
    }

    /**
     * 配置marked选项
     */
    configureMarked() {
        if (typeof marked === 'undefined') {
            console.warn('marked library not loaded');
            return;
        }

        // 配置marked渲染器
        const renderer = new marked.Renderer();
        
        // 自定义代码块渲染
        renderer.code = (code, language) => {
            const validLang = language || 'text';
            const escapedCode = this.escapeHtml(code);
            return `<div class="code-block-wrapper">
                <div class="code-header">
                    <span class="code-language">${validLang}</span>
                    <button class="copy-button" data-code="${escapedCode.replace(/"/g, '&quot;')}" title="复制代码">
                        📋 复制
                    </button>
                </div>
                <pre class="code-block" data-language="${validLang}"><code class="language-${validLang}">${escapedCode}</code></pre>
            </div>`;
        };

        // 自定义表格渲染
        renderer.table = (header, body) => {
            return `<div class="table-wrapper">
                <div class="table-header">
                    <button class="copy-button" data-table="${this.escapeHtml(header + body)}" title="复制表格">
                        📋 复制表格
                    </button>
                </div>
                <div class="table-container"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>
            </div>`;
        };

        // 自定义链接渲染，添加安全检查
        renderer.link = (href, title, text) => {
            const safeHref = this.sanitizeUrl(href);
            const titleAttr = title ? ` title="${this.escapeHtml(title)}"` : '';
            return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
        };

        // 设置marked选项
        marked.setOptions({
            renderer: renderer,
            highlight: this.highlightCode.bind(this),
            breaks: true,
            gfm: true,
            sanitize: false,
            smartypants: true,
            pedantic: false,
            silent: true
        });
    }

    /**
     * 初始化Mermaid
     */
    async initMermaid() {
        if (typeof mermaid === 'undefined') {
            console.warn('mermaid library not loaded');
            return;
        }

        try {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                themeVariables: {
                    primaryColor: '#3b82f6',
                    primaryTextColor: '#1f2937',
                    primaryBorderColor: '#e5e7eb',
                    lineColor: '#6b7280',
                    secondaryColor: '#f3f4f6',
                    tertiaryColor: '#ffffff'
                },
                securityLevel: 'loose',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            });
            this.mermaidInitialized = true;
        } catch (error) {
            console.error('Failed to initialize Mermaid:', error);
        }
    }

    /**
     * 配置KaTeX
     */
    configureKaTeX() {
        if (typeof katex === 'undefined') {
            console.warn('katex library not loaded');
            return;
        }

        // KaTeX配置在渲染时处理
    }

    /**
     * 渲染消息内容
     */
    async renderMessage(content, options = {}) {
        const {
            enableMarkdown = true,
            enableHtml = true,
            enableMermaid = true,
            enableKaTeX = true,
            enableCopy = true
        } = options;

        try {
            let renderedContent = content;

            // 确保内容是字符串
            if (typeof renderedContent !== 'string') {
                renderedContent = JSON.stringify(renderedContent, null, 2);
            }

            // 检测并优化JSON内容渲染
            if (this.isJsonContent(renderedContent)) {
                renderedContent = this.renderJsonContent(renderedContent);
            }

            // 1. 处理数学公式（必须在Markdown之前）
            if (enableKaTeX) {
                renderedContent = this.renderMath(renderedContent);
            }

            // 2. 处理Markdown
            if (enableMarkdown) {
                renderedContent = this.renderMarkdown(renderedContent);
            }

            // 3. 处理Mermaid图表
            if (enableMermaid) {
                renderedContent = await this.renderMermaid(renderedContent);
            }

            // 4. 复制功能现在在marked渲染器中处理
            // 这里不需要额外处理

            return renderedContent;
        } catch (error) {
            console.error('Failed to render message:', error);
            return this.escapeHtml(content);
        }
    }

    /**
     * 渲染Markdown内容
     */
    renderMarkdown(content) {
        if (typeof marked === 'undefined') {
            return this.escapeHtml(content);
        }

        try {
            return marked.parse(content);
        } catch (error) {
            console.error('Markdown rendering error:', error);
            return this.escapeHtml(content);
        }
    }

    /**
     * 渲染数学公式
     */
    renderMath(content) {
        if (typeof katex === 'undefined') {
            return content;
        }

        try {
            // 处理行内公式 $...$
            content = content.replace(/\$([^$]+)\$/g, (match, formula) => {
                try {
                    return katex.renderToString(formula, {
                        displayMode: false,
                        throwOnError: false
                    });
                } catch (error) {
                    console.warn('KaTeX inline rendering error:', error);
                    return match;
                }
            });

            // 处理块级公式 $$...$$
            content = content.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
                try {
                    return katex.renderToString(formula, {
                        displayMode: true,
                        throwOnError: false
                    });
                } catch (error) {
                    console.warn('KaTeX block rendering error:', error);
                    return match;
                }
            });

            return content;
        } catch (error) {
            console.error('Math rendering error:', error);
            return content;
        }
    }

    /**
     * 渲染Mermaid图表
     */
    async renderMermaid(content) {
        if (!this.mermaidInitialized) {
            return content;
        }

        try {
            // 查找所有Mermaid代码块
            const mermaidRegex = /```mermaid\n([\s\S]*?)\n```/g;
            const mermaidBlocks = [];
            let match;
            let index = 0;

            while ((match = mermaidRegex.exec(content)) !== null) {
                const mermaidCode = match[1].trim();
                const placeholder = `__MERMAID_PLACEHOLDER_${index}__`;
                mermaidBlocks.push({ code: mermaidCode, placeholder });
                content = content.replace(match[0], placeholder);
                index++;
            }

            // 渲染所有Mermaid图表
            for (const { code, placeholder } of mermaidBlocks) {
                try {
                    const { svg } = await mermaid.render(`mermaid-${Date.now()}-${Math.random()}`, code);
                    const wrappedSvg = `<div class="mermaid-container">${svg}</div>`;
                    content = content.replace(placeholder, wrappedSvg);
                } catch (error) {
                    console.warn('Mermaid rendering error:', error);
                    const errorHtml = `<div class="mermaid-error">
                        <div class="error-message">图表渲染失败</div>
                        <pre><code>${this.escapeHtml(code)}</code></pre>
                    </div>`;
                    content = content.replace(placeholder, errorHtml);
                }
            }

            return content;
        } catch (error) {
            console.error('Mermaid processing error:', error);
            return content;
        }
    }

    /**
     * 代码高亮处理
     */
    highlightCode(code, language) {
        if (typeof Prism === 'undefined') {
            return this.escapeHtml(code);
        }

        try {
            const validLanguage = language || 'text';
            if (Prism.languages[validLanguage]) {
                return Prism.highlight(code, Prism.languages[validLanguage], validLanguage);
            } else {
                return this.escapeHtml(code);
            }
        } catch (error) {
            console.warn('Code highlighting error:', error);
            return this.escapeHtml(code);
        }
    }

    // 复制按钮功能现在集成在marked渲染器中

    /**
     * 提取表格内容为Markdown格式
     */
    extractTableContent(tableHtml) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(tableHtml, 'text/html');
            const table = doc.querySelector('table');
            
            if (!table) return tableHtml;

            let markdown = '';
            
            // 处理表头
            const thead = table.querySelector('thead tr');
            if (thead) {
                const headers = Array.from(thead.querySelectorAll('th, td')).map(cell => 
                    cell.textContent.trim()
                );
                markdown += '| ' + headers.join(' | ') + ' |\n';
                markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
            }

            // 处理表体
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td')).map(cell => 
                    cell.textContent.trim()
                );
                markdown += '| ' + cells.join(' | ') + ' |\n';
            });

            return markdown;
        } catch (error) {
            console.warn('Table content extraction error:', error);
            return tableHtml;
        }
    }

    /**
     * 处理复制按钮点击事件
     */
    setupCopyButtons(container) {
        const copyButtons = container.querySelectorAll('.copy-button');
        copyButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleCopyClick(button);
            });
        });
    }

    /**
     * 处理复制点击
     */
    async handleCopyClick(button) {
        let content = '';
        
        // 获取要复制的内容
        if (button.hasAttribute('data-code')) {
            content = button.getAttribute('data-code');
        } else if (button.hasAttribute('data-table')) {
            content = button.getAttribute('data-table');
        } else if (button.hasAttribute('data-copy-id')) {
            const copyId = button.getAttribute('data-copy-id');
            content = this.copyButtons.get(copyId);
        }
        
        if (!content) return;

        try {
            // 如果是表格内容，需要从HTML转换为Markdown格式
            if (button.hasAttribute('data-table')) {
                content = this.extractTableContent(button.closest('.table-wrapper').querySelector('table').outerHTML);
            }

            await navigator.clipboard.writeText(content);
            
            // 更新按钮状态
            const originalText = button.innerHTML;
            button.innerHTML = '✅ 已复制';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.error('Copy failed:', error);
            button.innerHTML = '❌ 复制失败';
            setTimeout(() => {
                button.innerHTML = '📋 复制';
            }, 2000);
        }
    }

    /**
     * URL安全处理
     */
    sanitizeUrl(url) {
        try {
            const parsed = new URL(url);
            // 只允许http和https协议
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return url;
            }
            return '#';
        } catch (error) {
            return '#';
        }
    }

    /**
     * HTML转义
     */
    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            unsafe = String(unsafe);
        }
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * 检测内容是否为JSON格式
     */
    isJsonContent(content) {
        const trimmed = content.trim();
        return (
            (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('```json') && trimmed.endsWith('```')) ||
            (trimmed.startsWith('```JSON') && trimmed.endsWith('```'))
        );
    }

    /**
     * 渲染JSON内容
     */
    renderJsonContent(content) {
        const trimmed = content.trim();
        
        // 如果是代码块格式的JSON，提取其中的JSON内容
        if ((trimmed.startsWith('```json') || trimmed.startsWith('```JSON')) && trimmed.endsWith('```')) {
            const jsonContent = trimmed.replace(/```(?:json|JSON)\n?([\s\S]*?)\n?```/, '$1');
            return this.formatJsonCodeBlock(jsonContent);
        }
        
        // 如果是纯JSON格式
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                // 验证是否为有效JSON
                JSON.parse(trimmed);
                return this.formatJsonCodeBlock(trimmed);
            } catch (error) {
                // 如果不是有效JSON，作为普通文本处理
                return content;
            }
        }
        
        return content;
    }

    /**
     * 格式化JSON代码块
     */
    formatJsonCodeBlock(jsonContent) {
        try {
            // 尝试格式化JSON
            const parsed = JSON.parse(jsonContent);
            const formattedJson = JSON.stringify(parsed, null, 2);
            
            // 使用代码块格式，添加复制按钮
            return `<div class="json-block-wrapper">
                <div class="json-header">
                    <span class="json-type">JSON</span>
                    <button class="copy-button" data-code="${this.escapeHtml(formattedJson)}" title="复制JSON">
                        📋 复制
                    </button>
                </div>
                <pre class="json-block"><code class="language-json">${this.escapeHtml(formattedJson)}</code></pre>
            </div>`;
        } catch (error) {
            // 如果JSON解析失败，使用原始内容
            return `<div class="json-block-wrapper">
                <div class="json-header">
                    <span class="json-type">JSON (Raw)</span>
                    <button class="copy-button" data-code="${this.escapeHtml(jsonContent)}" title="复制内容">
                        📋 复制
                    </button>
                </div>
                <pre class="json-block"><code class="language-json">${this.escapeHtml(jsonContent)}</code></pre>
            </div>`;
        }
    }

    /**
     * 清理资源
     */
    destroy() {
        this.copyButtons.clear();
        this.initialized = false;
        this.mermaidInitialized = false;
    }
}

// 导出RichMediaRenderer类
window.RichMediaRenderer = RichMediaRenderer;