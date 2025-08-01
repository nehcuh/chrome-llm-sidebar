// Content script for Simple AI Copilot
// This script runs on web pages and can interact with the page content

class ContentScript {
    constructor() {
        this.init();
    }

    init() {
        this.injectPageStyles();
        this.setupMessageListener();
    }

    injectPageStyles() {
        // Add subtle indication that the copilot is active
        const style = document.createElement('style');
        style.textContent = `
            .ai-copilot-highlight {
                outline: 2px solid #007bff !important;
                outline-offset: 2px !important;
            }
        `;
        document.head.appendChild(style);
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.agenticAction) {
                this.handleAgenticAction(message.agenticAction)
                    .then(sendResponse)
                    .catch(error => {
                        console.error('[AGENT-MODE-CONTENT] Error:', error);
                        sendResponse({ status: `Error: ${error.message}` });
                    });
                return true; // Indicates async response
            }

            // Keep old message handling for backward compatibility if needed
            switch (message.action) {
                case 'getPageContent':
                    sendResponse({ content: this.getPageContent() });
                    break;
                case 'highlightElement':
                    this.highlightElement(message.selector);
                    break;
            }
            return true;
        });
    }

    async handleAgenticAction(action) {
        console.log('[AGENT-MODE-CONTENT] Received action:', action);

        // Handle actions that don't require finding an element first
        switch (action.type) {
            case 'SUMMARIZE_PAGE':
                const text = this.getMainTextContent();
                return { status: 'Page content extracted', data: text };
            case 'LIST_LINKS':
                const links = this.getAllLinks();
                return { status: 'Links extracted', data: links };
        }

        // Handle actions that DO require finding an element
        const element = await this.findOrAskLLM(action.target, action.type);

        if (!element) {
            throw new Error(`Element with description "${action.target}" not found, even with LLM assistance.`);
        }

        this.highlightElement(element);

        switch (action.type) {
            case 'CLICK_ELEMENT':
                element.click();
                return { status: `Clicked on "${action.target}"` };
            case 'TYPE_IN_ELEMENT':
                element.value = action.value;
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                return { status: `Typed "${action.value}" into "${action.target}"` };
            default:
                throw new Error(`Unknown action type: ${action.type}`);
        }
    }

    async findOrAskLLM(target, actionType) {
        // First, try the fast, heuristic-based search
        let element = this.findElementHeuristically(target);
        if (element) {
            console.log('[AGENT-MODE-CONTENT] Found element heuristically.');
            return element;
        }

        // If heuristics fail, wait a moment and try again (for dynamic content)
        console.log('[AGENT-MODE-CONTENT] First attempt failed. Waiting for dynamic content...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        element = this.findElementHeuristically(target);
        if (element) {
            console.log('[AGENT-MODE-CONTENT] Found element on second attempt.');
            return element;
        }

        // If heuristics still fail, invoke the LLM
        console.log('[AGENT-MODE-CONTENT] Heuristics failed. Asking LLM for help...');
        try {
            const simplifiedDOM = this.getSimplifiedDOM();
            const response = await chrome.runtime.sendMessage({
                llmFindElementRequest: {
                    dom: simplifiedDOM,
                    target,
                    actionType
                }
            });

            if (response.error) {
                throw new Error(response.error);
            }

            if (response.agentId) {
                return document.querySelector(`[data-agent-id="${response.agentId}"]`);
            }
            return null;
        } catch (error) {
            console.error('[AGENT-MODE-CONTENT] LLM assistance failed:', error);
            return null;
        }
    }

    findElementHeuristically(target) {
        const lowerTarget = target.toLowerCase();
        const allSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"]';
        let elements = Array.from(document.querySelectorAll(allSelectors));

        // Strategy 0: Try as CSS selector first (for cases like "input[name='q']")
        try {
            const element = document.querySelector(target);
            if (element) {
                console.log('[AGENT-MODE-CONTENT] Found element using CSS selector:', target);
                return element;
            } else {
                console.log('[AGENT-MODE-CONTENT] CSS selector found no elements:', target);
            }
        } catch (e) {
            console.log('[AGENT-MODE-CONTENT] Invalid CSS selector:', target, e);
            // Invalid CSS selector, continue with other strategies
        }

        // Strategy 1: Exact match for aria-label
        let element = elements.find(el => el.getAttribute('aria-label')?.toLowerCase() === lowerTarget);
        if (element) return element;

        // Strategy 2: Find label and associated input
        const labels = Array.from(document.querySelectorAll('label'));
        const targetLabel = labels.find(label => label.textContent.toLowerCase().trim() === lowerTarget);
        if (targetLabel) {
            const inputId = targetLabel.getAttribute('for');
            if (inputId) {
                const inputElement = document.getElementById(inputId);
                if (inputElement) return inputElement;
            }
        }

        // Strategy 3: Find by text content (buttons, links)
        element = elements.find(el => el.textContent.toLowerCase().trim() === lowerTarget);
        if (element) return element;

        // Strategy 4: Find by value attribute (especially for submit buttons)
        element = elements.find(el => el.value?.toLowerCase() === lowerTarget);
        if (element) return element;

        // Strategy 5: Find input by placeholder
        element = elements.find(el => el.placeholder?.toLowerCase() === lowerTarget);
        if (element) return element;
        
        // Strategy 6: Partial match in text for buttons/links
        element = elements.find(el => el.textContent.toLowerCase().includes(lowerTarget));
        if (element) return element;

        // Strategy 7: Special handling for common search engines
        if (lowerTarget.includes('search') || lowerTarget.includes('input')) {
            // Try common search input selectors
            const searchSelectors = [
                'input[name="q"]',
                'input[name="search"]', 
                'input[type="search"]',
                'input[placeholder*="搜索"]',
                'input[placeholder*="search"]',
                'input[id*="search"]',
                'input[class*="search"]',
                'input#kw',  // Baidu
                'input#su'   // Baidu button
            ];
            
            for (const selector of searchSelectors) {
                const searchElement = document.querySelector(selector);
                if (searchElement) {
                    console.log('[AGENT-MODE-CONTENT] Found search element using fallback selector:', selector);
                    return searchElement;
                }
            }
        }

        // Strategy 8: Try to find any visible input element as last resort
        const visibleInputs = Array.from(document.querySelectorAll('input')).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
        });
        
        if (visibleInputs.length > 0) {
            console.log('[AGENT-MODE-CONTENT] Using first visible input as fallback');
            return visibleInputs[0];
        }

        return null;
    }

    getSimplifiedDOM() {
        const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"]';
        const elements = Array.from(document.querySelectorAll(interactiveSelectors));
        let idCounter = 0;

        return elements.map(el => {
            const agentId = `agent-el-${idCounter++}`;
            el.setAttribute('data-agent-id', agentId);

            return {
                agentId: agentId,
                tagName: el.tagName.toLowerCase(),
                text: el.textContent ? el.textContent.trim().substring(0, 100) : '',
                value: el.value ? el.value.trim() : '',
                type: el.getAttribute('type'),
                name: el.getAttribute('name'),
                ariaLabel: el.getAttribute('aria-label'),
                placeholder: el.getAttribute('placeholder'),
                id: el.id,
            };
        }).filter(item => item.text || item.ariaLabel || item.placeholder || item.value); // Filter out non-descriptive elements
    }

    getMainTextContent() {
        // Remove common non-content elements for a cleaner summary
        const clonedBody = document.body.cloneNode(true);
        clonedBody.querySelectorAll('nav, footer, aside, script, style, noscript, header, [role="navigation"], [role="banner"], [role="contentinfo"]').forEach(el => el.remove());

        let mainContent = clonedBody.querySelector('main') || clonedBody.querySelector('article');
        if (!mainContent) {
            // Fallback to the whole body if no main/article tag
            mainContent = clonedBody;
        }
        
        // Return text content, remove excessive newlines
        return mainContent.innerText.replace(/\n{3,}/g, '\n\n').trim();
    }

    getAllLinks() {
        const links = Array.from(document.querySelectorAll('a'));
        return links
            .map(link => ({
                text: link.innerText.trim(),
                href: link.href
            }))
            .filter(link => link.href && !link.href.startsWith('javascript:')); // Filter out invalid or JS links
    }

    getPageContent() {
        // Extract useful page content for AI context
        return {
            title: document.title,
            url: window.location.href,
            selectedText: window.getSelection().toString(),
            headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent),
            description: document.querySelector('meta[name="description"]')?.content || ''
        };
    }

    highlightElement(elementOrSelector) {
        // Remove previous highlights
        document.querySelectorAll('.ai-copilot-highlight').forEach(el => {
            el.classList.remove('ai-copilot-highlight');
        });

        let element;
        if (typeof elementOrSelector === 'string') {
            element = document.querySelector(elementOrSelector);
        } else {
            element = elementOrSelector;
        }

        // Add new highlight
        if (element) {
            element.classList.add('ai-copilot-highlight');
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

new ContentScript();