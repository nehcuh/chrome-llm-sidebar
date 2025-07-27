class SearchService {
    constructor() {
        this.searchAPIs = {
            duckduckgo: 'https://api.duckduckgo.com/',
            serper: 'https://google.serper.dev/search',
            // 可以添加更多搜索API
        };
    }

    async search(query, options = {}) {
        const { provider = 'duckduckgo', maxResults = 5 } = options;
        
        try {
            switch (provider) {
                case 'duckduckgo':
                    return await this.searchDuckDuckGo(query, maxResults);
                case 'serper':
                    return await this.searchSerper(query, maxResults);
                default:
                    throw new Error(`Unsupported search provider: ${provider}`);
            }
        } catch (error) {
            console.error('Search failed:', error);
            return this.getFallbackSearchResults(query);
        }
    }

    async searchDuckDuckGo(query, maxResults) {
        try {
            const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
            const data = await response.json();
            
            const results = [];
            
            // 添加摘要
            if (data.Abstract) {
                results.push({
                    title: data.AbstractSource || 'DuckDuckGo',
                    snippet: data.Abstract,
                    url: data.AbstractURL || '',
                    type: 'summary'
                });
            }
            
            // 添加相关主题
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
                const topics = data.RelatedTopics.slice(0, maxResults - results.length);
                topics.forEach(topic => {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: topic.Text.split(' - ')[0] || topic.Text,
                            snippet: topic.Text,
                            url: topic.FirstURL,
                            type: 'topic'
                        });
                    }
                });
            }
            
            return this.formatSearchResults(results, query);
        } catch (error) {
            throw new Error(`DuckDuckGo search failed: ${error.message}`);
        }
    }

    async searchSerper(query, maxResults) {
        // 注意：Serper API需要API key，这里提供框架
        try {
            const apiKey = await this.getSerperApiKey();
            if (!apiKey) {
                throw new Error('Serper API key not configured');
            }

            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    q: query,
                    num: maxResults
                })
            });

            const data = await response.json();
            const results = [];

            if (data.organic) {
                data.organic.forEach(item => {
                    results.push({
                        title: item.title,
                        snippet: item.snippet,
                        url: item.link,
                        type: 'organic'
                    });
                });
            }

            return this.formatSearchResults(results, query);
        } catch (error) {
            throw new Error(`Serper search failed: ${error.message}`);
        }
    }

    async getSerperApiKey() {
        try {
            const result = await chrome.storage.sync.get(['serperApiKey']);
            return result.serperApiKey;
        } catch (error) {
            return null;
        }
    }

    formatSearchResults(results, query) {
        if (results.length === 0) {
            return `未找到关于 "${query}" 的相关信息。`;
        }

        let formatted = `关于 "${query}" 的搜索结果：\n\n`;
        
        results.forEach((result, index) => {
            formatted += `${index + 1}. **${result.title}**\n`;
            formatted += `   ${result.snippet}\n`;
            if (result.url) {
                formatted += `   来源: ${result.url}\n`;
            }
            formatted += '\n';
        });

        return formatted;
    }

    getFallbackSearchResults(query) {
        return `搜索功能暂时不可用。建议您：
1. 检查网络连接
2. 尝试使用不同的搜索关键词
3. 直接访问搜索引擎查询："${query}"

常用搜索引擎：
- Google: https://www.google.com/search?q=${encodeURIComponent(query)}
- Bing: https://www.bing.com/search?q=${encodeURIComponent(query)}
- DuckDuckGo: https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    }

    // 智能判断是否需要搜索
    shouldPerformSearch(message) {
        const searchIndicators = [
            // 中文指示词
            '搜索', '查找', '查询', '最新', '现在', '今天', '新闻', '消息',
            '什么是', '如何', '怎么', '为什么', '哪里', '什么时候',
            '最近', '最新的', '现在的', '今年', '本月', '本周',
            
            // 英文指示词
            'search', 'find', 'look up', 'latest', 'recent', 'news',
            'what is', 'how to', 'where is', 'when did', 'current',
            'today', 'now', 'this year', 'this month'
        ];

        const lowerMessage = message.toLowerCase();
        return searchIndicators.some(indicator => 
            lowerMessage.includes(indicator.toLowerCase())
        );
    }

    // 从消息中提取搜索查询
    extractSearchQuery(message) {
        // 移除常见的前缀和后缀
        let query = message
            .replace(/^(请|帮我|能否|可以|麻烦|help me|can you|please)/i, '')
            .replace(/(搜索|查找|查询|search|find|look up)/i, '')
            .replace(/[？?！!。.]+$/, '')
            .trim();

        // 如果查询太短或太长，返回原消息的关键部分
        if (query.length < 2) {
            return message;
        }
        
        if (query.length > 100) {
            query = query.substring(0, 100);
        }

        return query;
    }
}