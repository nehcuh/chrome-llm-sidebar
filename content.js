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
        console.log('[AGENT-MODE-CONTENT] Current URL:', window.location.href);

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
        console.log('[AGENT-MODE-CONTENT] Looking for element:', action.target);
        
        // Wait for page to stabilize before searching
        await this.waitForPageStable();
        
        const element = await this.findOrAskLLM(action.target, action.type);

        if (!element) {
            // Try adaptive strategies
            console.log('[AGENT-MODE-CONTENT] Element not found, trying adaptive strategies...');
            const adaptiveResult = await this.tryAdaptiveStrategies(action.target, action.type);
            if (adaptiveResult) {
                return adaptiveResult;
            }
            
            throw new Error(`Element with description "${action.target}" not found, even with adaptive strategies.`);
        }

        console.log('[AGENT-MODE-CONTENT] Found element:', element.tagName, element);
        this.highlightElement(element);

        switch (action.type) {
            case 'CLICK_ELEMENT':
                console.log('[AGENT-MODE-CONTENT] Clicking element...');
                element.click();
                console.log('[AGENT-MODE-CONTENT] Element clicked successfully');
                return { status: `Clicked on "${action.target}"` };
            case 'TYPE_IN_ELEMENT':
                console.log('[AGENT-MODE-CONTENT] Typing into element...');
                element.value = action.value;
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                console.log('[AGENT-MODE-CONTENT] Text typed successfully');
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

    debugAvailableElements() {
        console.log('[AGENT-MODE-CONTENT] === DEBUG: Available Interactive Elements ===');
        const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]');
        const elementsArray = Array.from(interactiveElements).slice(0, 20); // Limit to first 20
        
        elementsArray.forEach((el, index) => {
            const info = {
                index: index,
                tagName: el.tagName,
                type: el.type || 'N/A',
                name: el.name || 'N/A',
                id: el.id || 'N/A',
                className: el.className || 'N/A',
                title: el.title || 'N/A',
                ariaLabel: el.getAttribute('aria-label') || 'N/A',
                placeholder: el.placeholder || 'N/A',
                value: el.value ? el.value.substring(0, 50) : 'N/A',
                text: el.textContent ? el.textContent.trim().substring(0, 50) : 'N/A',
                visible: this.isElementVisible(el)
            };
            console.log(`[AGENT-MODE-CONTENT] Element ${index}:`, info);
        });
        
        if (interactiveElements.length > 20) {
            console.log(`[AGENT-MODE-CONTENT] ... and ${interactiveElements.length - 20} more elements`);
        }
        console.log(`[AGENT-MODE-CONTENT] 总计找到 ${interactiveElements.length} 个可交互元素`);
        console.log('[AGENT-MODE-CONTENT] === END DEBUG ===');
    }

    // Enhanced element discovery with state management
    discoverElements() {
        const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]');
        const elementsArray = Array.from(interactiveElements);
        
        console.log(`[AGENT-MODE-CONTENT] 发现页面上的可访问元素`);
        console.log(`[AGENT-MODE-CONTENT] 找到 ${elementsArray.length} 个可访问元素`);
        
        // Categorize elements for better understanding
        const categories = {
            buttons: [],
            inputs: [],
            links: [],
            selects: [],
            textareas: [],
            others: []
        };
        
        elementsArray.forEach(el => {
            const elementInfo = {
                tagName: el.tagName,
                type: el.type || 'N/A',
                name: el.name || 'N/A',
                id: el.id || 'N/A',
                className: el.className || 'N/A',
                title: el.title || 'N/A',
                ariaLabel: el.getAttribute('aria-label') || 'N/A',
                placeholder: el.placeholder || 'N/A',
                value: el.value ? el.value.substring(0, 50) : 'N/A',
                text: el.textContent ? el.textContent.trim().substring(0, 50) : 'N/A',
                visible: this.isElementVisible(el)
            };
            
            switch (el.tagName.toLowerCase()) {
                case 'button':
                    categories.buttons.push(elementInfo);
                    break;
                case 'input':
                    categories.inputs.push(elementInfo);
                    break;
                case 'a':
                    categories.links.push(elementInfo);
                    break;
                case 'select':
                    categories.selects.push(elementInfo);
                    break;
                case 'textarea':
                    categories.textareas.push(elementInfo);
                    break;
                default:
                    categories.others.push(elementInfo);
            }
        });
        
        // Log category summary
        Object.keys(categories).forEach(category => {
            if (categories[category].length > 0) {
                console.log(`[AGENT-MODE-CONTENT] ${category}: ${categories[category].length} 个元素`);
            }
        });
        
        return {
            total: elementsArray.length,
            categories: categories,
            elements: elementsArray
        };
    }

    // Find elements by text pattern
    findElementsByText(pattern, options = {}) {
        const {
            exactMatch = false,
            caseSensitive = false,
            visibleOnly = true,
            maxResults = 10
        } = options;
        
        const allElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]');
        let elements = Array.from(allElements);
        
        if (visibleOnly) {
            elements = elements.filter(el => this.isElementVisible(el));
        }
        
        const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
        const matchingElements = [];
        
        elements.forEach(el => {
            const text = (el.textContent || el.value || '').trim();
            const searchText = caseSensitive ? text : text.toLowerCase();
            
            let matches = false;
            if (exactMatch) {
                matches = searchText === searchPattern;
            } else {
                matches = searchText.includes(searchPattern);
            }
            
            if (matches) {
                matchingElements.push({
                    element: el,
                    text: text,
                    tagName: el.tagName,
                    type: el.type || 'N/A',
                    visible: this.isElementVisible(el)
                });
            }
        });
        
        console.log(`[AGENT-MODE-CONTENT] 按文本"${pattern}"搜索找到 ${matchingElements.length} 个元素`);
        return matchingElements.slice(0, maxResults);
    }

    // Find checkboxes or multi-select elements
    findSelectableElements() {
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(el => this.isElementVisible(el));
        const multiSelects = Array.from(document.querySelectorAll('select[multiple]')).filter(el => this.isElementVisible(el));
        const radioButtons = Array.from(document.querySelectorAll('input[type="radio"]')).filter(el => this.isElementVisible(el));
        
        console.log(`[AGENT-MODE-CONTENT] 发现 ${checkboxes.length} 个复选框, ${multiSelects.length} 个多选框, ${radioButtons.length} 个单选按钮`);
        
        return {
            checkboxes: checkboxes,
            multiSelects: multiSelects,
            radioButtons: radioButtons
        };
    }

    // Scroll page to reveal hidden elements
    async scrollToRevealElements() {
        const scrollHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        let currentScroll = 0;
        
        console.log('[AGENT-MODE-CONTENT] 开始滚动页面以查找隐藏元素');
        
        while (currentScroll < scrollHeight) {
            window.scrollTo(0, currentScroll);
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for content to load
            
            // Check for new elements
            const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]');
            console.log(`[AGENT-MODE-CONTENT] 滚动到 ${currentScroll}px, 发现 ${elements.length} 个元素`);
            
            currentScroll += viewportHeight;
        }
        
        // Scroll back to top
        window.scrollTo(0, 0);
        console.log('[AGENT-MODE-CONTENT] 页面滚动完成');
    }

    // Wait for page stabilization
    async waitForPageStable(maxWaitTime = 5000) {
        console.log('[AGENT-MODE-CONTENT] 等待页面稳定...');
        let lastElementCount = 0;
        let stableCount = 0;
        const startTime = Date.now();
        
        while (stableCount < 3 && Date.now() - startTime < maxWaitTime) {
            const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]');
            const currentCount = elements.length;
            
            if (currentCount === lastElementCount) {
                stableCount++;
            } else {
                stableCount = 0;
                lastElementCount = currentCount;
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log(`[AGENT-MODE-CONTENT] 页面稳定，当前元素数量: ${lastElementCount}`);
    }

    // Adaptive strategies for when element search fails
    async tryAdaptiveStrategies(target, actionType) {
        console.log('[AGENT-MODE-CONTENT] Starting adaptive strategies for target:', target);
        
        // Strategy 1: Try scrolling to reveal hidden elements
        console.log('[AGENT-MODE-CONTENT] Strategy 1: Scrolling to reveal hidden elements');
        await this.scrollToRevealElements();
        
        // Try searching again after scrolling
        let element = this.findElementHeuristically(target);
        if (element) {
            console.log('[AGENT-MODE-CONTENT] Found element after scrolling');
            return this.executeAction(element, actionType, target);
        }
        
        // Strategy 2: Try text-based search with different patterns
        console.log('[AGENT-MODE-CONTENT] Strategy 2: Trying different text patterns');
        const textPatterns = [
            target,
            target.toLowerCase(),
            target.toUpperCase(),
            target.replace(/\s+/g, ''),
            target.replace(/[^\w\s]/g, ''),
            target.substring(0, 10) // Try first 10 characters
        ];
        
        for (const pattern of textPatterns) {
            const textMatches = this.findElementsByText(pattern, { exactMatch: false });
            if (textMatches.length > 0) {
                console.log(`[AGENT-MODE-CONTENT] Found ${textMatches.length} matches for pattern: ${pattern}`);
                element = textMatches[0].element;
                return this.executeAction(element, actionType, target);
            }
        }
        
        // Strategy 3: Try finding similar elements
        console.log('[AGENT-MODE-CONTENT] Strategy 3: Finding similar elements');
        const similarElements = this.findSimilarElements(target);
        if (similarElements.length > 0) {
            console.log(`[AGENT-MODE-CONTENT] Found ${similarElements.length} similar elements`);
            element = similarElements[0];
            return this.executeAction(element, actionType, target);
        }
        
        // Strategy 4: Try page navigation approach
        if (target.includes('邮箱') || target.includes('mail') || target.includes('email')) {
            console.log('[AGENT-MODE-CONTENT] Strategy 4: Email-specific approach');
            return await this.handleEmailOperations(target, actionType);
        }
        
        if (target.includes('删除') || target.includes('delete') || target.includes('remove')) {
            console.log('[AGENT-MODE-CONTENT] Strategy 4: Delete-specific approach');
            return await this.handleDeleteOperations(target, actionType);
        }
        
        console.log('[AGENT-MODE-CONTENT] All adaptive strategies failed');
        return null;
    }

    // Find elements similar to the target
    findSimilarElements(target) {
        const allElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]');
        const visibleElements = Array.from(allElements).filter(el => this.isElementVisible(el));
        
        const targetWords = target.toLowerCase().split(/\s+/);
        const similarElements = [];
        
        visibleElements.forEach(el => {
            const text = (el.textContent || el.value || '').toLowerCase();
            const title = (el.title || '').toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            
            let similarityScore = 0;
            targetWords.forEach(word => {
                if (text.includes(word)) similarityScore++;
                if (title.includes(word)) similarityScore++;
                if (ariaLabel.includes(word)) similarityScore++;
            });
            
            if (similarityScore > 0) {
                similarElements.push({ element: el, score: similarityScore });
            }
        });
        
        // Sort by similarity score
        similarElements.sort((a, b) => b.score - a.score);
        return similarElements.map(item => item.element);
    }

    // Handle email-related operations
    async handleEmailOperations(target, actionType) {
        console.log('[AGENT-MODE-CONTENT] Handling email operations');
        
        // Look for email-related elements
        const emailElements = this.findElementsByText('mail', { exactMatch: false, maxResults: 20 });
        const mailElements = this.findElementsByText('邮箱', { exactMatch: false, maxResults: 20 });
        const allEmailElements = [...emailElements, ...mailElements];
        
        if (allEmailElements.length > 0) {
            console.log(`[AGENT-MODE-CONTENT] Found ${allEmailElements.length} email-related elements`);
            const element = allEmailElements[0].element;
            return this.executeAction(element, actionType, target);
        }
        
        return null;
    }

    // Handle delete-related operations
    async handleDeleteOperations(target, actionType) {
        console.log('[AGENT-MODE-CONTENT] Handling delete operations');
        
        // Look for delete-related elements
        const deleteElements = this.findElementsByText('delete', { exactMatch: false, maxResults: 10 });
        const removeElements = this.findElementsByText('remove', { exactMatch: false, maxResults: 10 });
        const trashElements = this.findElementsByText('trash', { exactMatch: false, maxResults: 10 });
        const chineseDeleteElements = this.findElementsByText('删除', { exactMatch: false, maxResults: 10 });
        
        const allDeleteElements = [...deleteElements, ...removeElements, ...trashElements, ...chineseDeleteElements];
        
        if (allDeleteElements.length > 0) {
            console.log(`[AGENT-MODE-CONTENT] Found ${allDeleteElements.length} delete-related elements`);
            const element = allDeleteElements[0].element;
            return this.executeAction(element, actionType, target);
        }
        
        // Look for manage/action buttons that might contain delete options
        const manageElements = this.findElementsByText('manage', { exactMatch: false, maxResults: 5 });
        const actionElements = this.findElementsByText('action', { exactMatch: false, maxResults: 5 });
        const chineseManageElements = this.findElementsByText('管理', { exactMatch: false, maxResults: 5 });
        const chineseActionElements = this.findElementsByText('操作', { exactMatch: false, maxResults: 5 });
        
        const allManageElements = [...manageElements, ...actionElements, ...chineseManageElements, ...chineseActionElements];
        
        if (allManageElements.length > 0) {
            console.log(`[AGENT-MODE-CONTENT] Found ${allManageElements.length} manage/action elements`);
            const element = allManageElements[0].element;
            return this.executeAction(element, actionType, target);
        }
        
        return null;
    }

    // Execute action on element
    executeAction(element, actionType, target) {
        console.log('[AGENT-MODE-CONTENT] Executing action on adaptive-found element:', element.tagName);
        
        this.highlightElement(element);
        
        switch (actionType) {
            case 'CLICK_ELEMENT':
                console.log('[AGENT-MODE-CONTENT] Clicking adaptive-found element...');
                element.click();
                console.log('[AGENT-MODE-CONTENT] Element clicked successfully');
                return { status: `Clicked on "${target}" (adaptive strategy)` };
            case 'TYPE_IN_ELEMENT':
                console.log('[AGENT-MODE-CONTENT] Typing into adaptive-found element...');
                element.value = target; // Use target as value since action.value might not be available
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                console.log('[AGENT-MODE-CONTENT] Text typed successfully');
                return { status: `Typed into "${target}" (adaptive strategy)` };
            default:
                throw new Error(`Unknown action type: ${actionType}`);
        }
    }

    isElementVisible(el) {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               el.offsetWidth > 0 && 
               el.offsetHeight > 0;
    }

    findElementHeuristically(target) {
        console.log('[AGENT-MODE-CONTENT] Finding element heuristically for target:', target);
        const lowerTarget = target.toLowerCase();
        
        // Enhanced element discovery
        const elementDiscovery = this.discoverElements();
        
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
        if (element) {
            console.log('[AGENT-MODE-CONTENT] Found element by exact text match:', element);
            return element;
        }

        // Strategy 4: Find by value attribute (especially for submit buttons)
        element = elements.find(el => el.value?.toLowerCase() === lowerTarget);
        if (element) {
            console.log('[AGENT-MODE-CONTENT] Found element by value match:', element);
            return element;
        }

        // Strategy 5: Find input by placeholder
        element = elements.find(el => el.placeholder?.toLowerCase() === lowerTarget);
        if (element) return element;
        
        // Strategy 6: Partial match in text for buttons/links
        element = elements.find(el => el.textContent.toLowerCase().includes(lowerTarget));
        if (element) return element;

        // Strategy 7: Special handling for common search engines and specific buttons
        if (lowerTarget.includes('search') || lowerTarget.includes('input') || lowerTarget.includes('google') || lowerTarget.includes('baidu') || lowerTarget.includes('手气不错') || lowerTarget.includes('lucky') || lowerTarget.includes('email') || lowerTarget.includes('邮箱') || lowerTarget.includes('mail') || lowerTarget.includes('delete') || lowerTarget.includes('删除') || lowerTarget.includes('管理') || lowerTarget.includes('manage') || lowerTarget.includes('操作') || lowerTarget.includes('action') || lowerTarget.includes('书签') || lowerTarget.includes('bookmark') || lowerTarget.includes('收藏') || lowerTarget.includes('favorite')) {
            // Distinguish between search input and search button
            // Special handling for "手气不错" (I'm Feeling Lucky) button
          if (lowerTarget.includes('手气不错') || lowerTarget.includes('lucky')) {
              console.log('[AGENT-MODE-CONTENT] Looking for I\'m Feeling Lucky button');
              const luckyButtonSelectors = [
                  'input[name="btnI"]',
                  'input[value*="手气不错"]',
                  'input[value*="I\'m Feeling Lucky"]',
                  'button[aria-label*="手气不错"]',
                  'button[aria-label*="I\'m Feeling Lucky"]',
                  'input[aria-label*="手气不错"]',
                  'input[aria-label*="I\'m Feeling Lucky"]'
              ];
              
              for (const selector of luckyButtonSelectors) {
                  const luckyElement = document.querySelector(selector);
                  if (luckyElement) {
                      console.log('[AGENT-MODE-CONTENT] Found I\'m Feeling Lucky button using selector:', selector, 'Element:', luckyElement);
                      return luckyElement;
                  }
              }
          }
          
          // Special handling for email-related elements
          if (lowerTarget.includes('email') || lowerTarget.includes('邮箱') || lowerTarget.includes('mail')) {
              console.log('[AGENT-MODE-CONTENT] Looking for email-related element');
              const emailSelectors = [
                  'a[href*="mail"]',
                  'a[href*="email"]', 
                  'a[href*="邮箱"]',
                  'button[aria-label*="mail"]',
                  'button[aria-label*="email"]',
                  'button[aria-label*="邮箱"]',
                  'input[type="email"]',
                  'input[name*="email"]',
                  'input[name*="mail"]',
                  'input[id*="email"]',
                  'input[id*="mail"]'
              ];
              
              for (const selector of emailSelectors) {
                  const emailElement = document.querySelector(selector);
                  if (emailElement) {
                      console.log('[AGENT-MODE-CONTENT] Found email element using selector:', selector, 'Element:', emailElement);
                      return emailElement;
                  }
              }
          }
          
          // Special handling for delete-related elements
          if (lowerTarget.includes('delete') || lowerTarget.includes('删除')) {
              console.log('[AGENT-MODE-CONTENT] Looking for delete-related element');
              const deleteSelectors = [
                  'button[aria-label*="delete"]',
                  'button[aria-label*="删除"]',
                  'button[title*="delete"]',
                  'button[title*="删除"]',
                  'input[value*="delete"]',
                  'input[value*="删除"]',
                  'a[href*="delete"]',
                  'a[href*="删除"]',
                  'button[class*="delete"]',
                  'button[class*="remove"]',
                  'span[aria-label*="delete"]',
                  'span[aria-label*="删除"]',
                  'div[role="button"][aria-label*="delete"]',
                  'div[role="button"][aria-label*="删除"]'
              ];
              
              for (const selector of deleteSelectors) {
                  const deleteElement = document.querySelector(selector);
                  if (deleteElement) {
                      console.log('[AGENT-MODE-CONTENT] Found delete element using selector:', selector, 'Element:', deleteElement);
                      return deleteElement;
                  }
              }
          }
          
          // Special handling for manage/action elements
          if (lowerTarget.includes('manage') || lowerTarget.includes('管理') || lowerTarget.includes('action') || lowerTarget.includes('操作')) {
              console.log('[AGENT-MODE-CONTENT] Looking for manage/action element');
              const manageSelectors = [
                  'button[aria-label*="manage"]',
                  'button[aria-label*="管理"]',
                  'button[aria-label*="action"]',
                  'button[aria-label*="操作"]',
                  'button[title*="manage"]',
                  'button[title*="管理"]',
                  'button[title*="action"]',
                  'button[title*="操作"]',
                  'a[href*="manage"]',
                  'a[href*="管理"]',
                  'a[href*="action"]',
                  'a[href*="操作"]',
                  'button[class*="manage"]',
                  'button[class*="action"]',
                  'select[class*="action"]',
                  'select[class*="manage"]'
              ];
              
              for (const selector of manageSelectors) {
                  const manageElement = document.querySelector(selector);
                  if (manageElement) {
                      console.log('[AGENT-MODE-CONTENT] Found manage element using selector:', selector, 'Element:', manageElement);
                      return manageElement;
                  }
              }
          }
          
          // Special handling for bookmark/favorite elements
          if (lowerTarget.includes('书签') || lowerTarget.includes('bookmark') || lowerTarget.includes('收藏') || lowerTarget.includes('favorite')) {
              console.log('[AGENT-MODE-CONTENT] Looking for bookmark/favorite element');
              const bookmarkSelectors = [
                  // Twitter specific bookmark selectors
                  'button[aria-label*="Bookmark"]',
                  'button[aria-label*="书签"]',
                  'button[aria-label*="收藏"]',
                  'button[aria-label*="Favorite"]',
                  'button[data-testid="bookmark"]',
                  'button[data-testid="favorite"]',
                  'div[role="button"][aria-label*="Bookmark"]',
                  'div[role="button"][aria-label*="书签"]',
                  'div[role="button"][aria-label*="收藏"]',
                  'div[role="button"][aria-label*="Favorite"]',
                  // Generic bookmark selectors
                  'button[title*="bookmark"]',
                  'button[title*="书签"]',
                  'button[title*="收藏"]',
                  'button[title*="favorite"]',
                  'a[href*="bookmark"]',
                  'a[href*="favorite"]',
                  'button[class*="bookmark"]',
                  'button[class*="favorite"]',
                  'svg[aria-label*="bookmark"]',
                  'svg[aria-label*="书签"]',
                  'svg[aria-label*="收藏"]',
                  'svg[aria-label*="favorite"]'
              ];
              
              for (const selector of bookmarkSelectors) {
                  const bookmarkElement = document.querySelector(selector);
                  if (bookmarkElement) {
                      console.log('[AGENT-MODE-CONTENT] Found bookmark element using selector:', selector, 'Element:', bookmarkElement);
                      return bookmarkElement;
                  }
              }
          }
          
          // Distinguish between search input and search button
          if (lowerTarget.includes('input') || lowerTarget.includes('搜索框') || lowerTarget.includes('search input')) {
                console.log('[AGENT-MODE-CONTENT] Looking for search input specifically');
                // Search input specific selectors - more specific first
                const inputSelectors = [
                    // Google specific input - highest priority
                    'input[name="q"]',
                    'input[title*="Search"]',
                    'input[title*="search"]',
                    // Baidu specific input
                    'input#kw',
                    'input[name="wd"]',
                    // Generic input selectors
                    'input[type="search"]',
                    'input[name="search"]',
                    'input[placeholder*="search"]',
                    'input[placeholder*="Search"]',
                    'input[id*="search"]',
                    'input[class*="search"]',
                    'input[title*="search"]',
                    'input[aria-label*="search"]'
                ];
                
                for (const selector of inputSelectors) {
                    const searchElement = document.querySelector(selector);
                    if (searchElement) {
                        // Double-check it's not a button/submit type
                        if (searchElement.type !== 'submit' && searchElement.type !== 'button') {
                            console.log('[AGENT-MODE-CONTENT] Found search input using selector:', selector, 'Element:', searchElement);
                            return searchElement;
                        } else {
                            console.log('[AGENT-MODE-CONTENT] Skipping button element:', selector, searchElement);
                        }
                    }
                }
            } else if (lowerTarget.includes('button') || lowerTarget.includes('搜索按钮') || lowerTarget.includes('search button')) {
                console.log('[AGENT-MODE-CONTENT] Looking for search button specifically');
                // Search button specific selectors
                const buttonSelectors = [
                    // Google specific button - highest priority
                    'input[name="btnK"]',
                    'input[name="btnI"]',
                    'button[aria-label*="Google Search"]',
                    'button[aria-label*="搜索"]',
                    'button[aria-label*="search"]',
                    'button[type="submit"]',
                    'input[type="submit"]',
                    // Baidu specific button
                    'input#su',
                    'button.su',
                    // Generic button selectors
                    'button[class*="search"]',
                    'button[id*="search"]'
                ];
                
                for (const selector of buttonSelectors) {
                    const buttonElement = document.querySelector(selector);
                    if (buttonElement) {
                        console.log('[AGENT-MODE-CONTENT] Found search button using selector:', selector, 'Element:', buttonElement);
                        return buttonElement;
                    }
                }
                
                // Try to find buttons by text content
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
                const searchButton = buttons.find(btn => {
                    const text = btn.textContent || btn.value || '';
                    return text.toLowerCase().includes('search') || text.toLowerCase().includes('搜索') || text.toLowerCase().includes('go');
                });
                
                if (searchButton) {
                    console.log('[AGENT-MODE-CONTENT] Found search button by text content');
                    return searchButton;
                }
            } else {
                // Fallback to general search selectors
                console.log('[AGENT-MODE-CONTENT] Using fallback search selectors');
                const searchSelectors = [
                    // Google specific input first
                    'input[name="q"]',
                    'input[title*="Search"]',
                    // Baidu specific input  
                    'input#kw',
                    'input[name="wd"]',
                    // Generic search selectors
                    'input[type="search"]',
                    'input[name="search"]', 
                    'input[placeholder*="search"]',
                    'input[id*="search"]',
                    'input[class*="search"]',
                    'input[title*="search"]',
                    'input[aria-label*="search"]'
                ];
                
                for (const selector of searchSelectors) {
                    const searchElement = document.querySelector(selector);
                    if (searchElement) {
                        // Prioritize input types over button types for fallback
                        if (searchElement.type !== 'submit' && searchElement.type !== 'button') {
                            console.log('[AGENT-MODE-CONTENT] Found search element using fallback selector:', selector, 'Element:', searchElement);
                            return searchElement;
                        }
                    }
                }
            }
        }

        // Strategy 8: Try to find any element with matching text content (partial match)
        console.log('[AGENT-MODE-CONTENT] Trying partial text match as fallback');
        const allVisibleElements = Array.from(document.querySelectorAll('a, button, input, select, textarea')).filter(el => {
            return this.isElementVisible(el);
        });
        
        const partialMatch = allVisibleElements.find(el => {
            const text = (el.textContent || el.value || '').toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const title = (el.title || '').toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            
            return text.includes(lowerTarget) || 
                   placeholder.includes(lowerTarget) || 
                   title.includes(lowerTarget) || 
                   ariaLabel.includes(lowerTarget);
        });
        
        if (partialMatch) {
            console.log('[AGENT-MODE-CONTENT] Found element by partial text match:', partialMatch);
            return partialMatch;
        }

        // Strategy 9: Try to find any visible input element as last resort
        const visibleInputs = Array.from(document.querySelectorAll('input')).filter(el => {
            return this.isElementVisible(el);
        });
        
        if (visibleInputs.length > 0) {
            console.log('[AGENT-MODE-CONTENT] Using first visible input as fallback');
            return visibleInputs[0];
        }

        console.log('[AGENT-MODE-CONTENT] No element found for target:', target);
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