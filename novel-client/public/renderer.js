/**
 * AI小说生成器 - 渲染进程主逻辑
 */
class NovelGenerator {
    constructor() {
        this.serverUrl = "http://localhost:5000";
        this.selectedContexts = new Set();
        this.contexts = [];
        this.contextTree = [];
        this.messages = [];
        
        // 树状图相关属性
        this.treeData = null;
        this.treeViewMode = 'graph'; // 'graph' 或 'list'
        this.selectedNodeId = null;
        this.contextMenu = null;
        this.contextMenuTarget = null;
        
        // D3树状图相关
        this.treeSvg = null;
        this.treeG = null;
        this.treeZoom = null;
        this.treeWidth = 1200;  // 增加宽度以容纳更多节点
        this.treeHeight = 800;  // 增加高度以容纳更多节点
        this.treeMargin = { top: 40, right: 120, bottom: 40, left: 120 };  // 增加边距
        this.nodeSpacing = 80;  // 节点间距
        this.nodeRadius = 12;   // 节点半径
    
        // 提示框相关
        this.tooltip = null;
        this.tooltipTimeout = null;
        this.currentTooltipNodeId = null;
        
        // 左侧树状列表相关属性
        this.expandedNodes = new Set(); // 存储展开的节点ID
        this.currentRootNodeId = null; // 当前树状图显示的根节点ID
        
        // 多选相关属性
        this.isCtrlPressed = false;
        this.isShiftPressed = false;
        this.lastSelectedNodeId = null;
        this.multiSelectStartNodeId = null;
        this.multiSelectEndNodeId = null;
        
        // 编辑器相关属性
        this.editorContent = '';
        this.lastSavedContent = '';
        this.isSaving = false;
        this.saveInterval = null;
        
        // 绑定事件
        this.bindEvents();
        
        // 初始化
        this.init();
    }
    
    async init() {
        
        // 初始化右键菜单
        this.initContextMenu();
        
        // 初始化提示框
        this.initTooltip();
        
        // 初始化树状图可视化（只调用一次）
        this.initTreeVisualization();
        
        // 加载上下文
        await this.loadContexts();
    
        // 更新UI状态
        this.updateUIState();
    }
    
    bindEvents() {
        // 搜索框
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterContexts(e.target.value));
        }
        
        // 模态框关闭按钮
        document.getElementById('closeModalBtn')?.addEventListener('click', () => this.hideModal());
        
        // 树状图控制按钮
        document.addEventListener('click', (e) => {
            if (this.contextMenu && this.contextMenu.style.display === 'block') {
                this.hideContextMenu();
            }
        });
        
        // 键盘事件监听（用于多选）
        document.addEventListener('keydown', (e) => {
            this.isCtrlPressed = e.ctrlKey || e.metaKey; // metaKey for Mac
            this.isShiftPressed = e.shiftKey;
            
            // 监听Ctrl+G（或Cmd+G）唤起AI辅助面板
            if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault();
                this.toggleAiAssistPanel();
            }
            
            // 监听Ctrl+S保存编辑器内容
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveEditorContent();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.isCtrlPressed = e.ctrlKey || e.metaKey;
            this.isShiftPressed = e.shiftKey;
        });
        
        // 右键菜单项点击事件 - 直接绑定到右键菜单元素
        this.bindContextMenuEvents();
        
    // 清空选择按钮
    const clearSelectionBtn = document.querySelector('.btn-clear-selection');
    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', () => this.clearSelection());
    }
    
    // 左侧选项卡切换按钮
    const leftTabBtns = document.querySelectorAll('.tab-btn');
    leftTabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = e.target.dataset.tab;
            if (tabId) {
                this.switchLeftTab(tabId);
            }
        });
    });
    
    // AI辅助按钮事件
    const aiAssistBtn = document.getElementById('aiAssistBtn');
    if (aiAssistBtn) {
        aiAssistBtn.addEventListener('click', () => this.toggleAiAssistPanel());
    }
    
    // 关闭AI面板按钮
    const closeAiPanelBtn = document.getElementById('closeAiPanelBtn');
    if (closeAiPanelBtn) {
        closeAiPanelBtn.addEventListener('click', () => this.hideAiAssistPanel());
    }
    
    // AI生成按钮
    const aiGenerateBtn = document.getElementById('aiGenerateBtn');
    if (aiGenerateBtn) {
        aiGenerateBtn.addEventListener('click', () => this.generateAiContent());
    }
    
    // AI动作按钮
    const aiActionBtns = document.querySelectorAll('.ai-action-btn');
    aiActionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action || e.target.closest('.ai-action-btn').dataset.action;
            this.handleAiAction(action);
        });
    });
    
    // AI响应操作按钮
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="apply"]')) {
            this.applyAiResponse();
        } else if (e.target.closest('[data-action="discard"]')) {
            this.discardAiResponse();
        }
    });
    
    // AI输入框回车键支持
    const aiPromptInput = document.getElementById('aiPromptInput');
    if (aiPromptInput) {
        aiPromptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.generateAiContent();
            }
        });
    }
    
    // 保存编辑器按钮
    const saveEditorBtn = document.getElementById('saveEditorBtn');
    if (saveEditorBtn) {
        saveEditorBtn.addEventListener('click', () => this.saveEditorContent());
    }
    
    // 初始化编辑器字数统计
    this.initWordCount();
}

    // 切换左侧选项卡
    switchLeftTab(tabId) {
        console.log("📁 切换左侧选项卡:", tabId);
        
        // 更新按钮状态
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // 更新内容显示
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            if (content.id === `${tabId}Tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
        
        // 如果切换到已选中上下文选项卡，渲染已选中上下文列表
        if (tabId === 'selected-contexts') {
            this.renderSelectedContexts();
        }
    }

// 渲染已选中上下文列表
renderSelectedContexts() {
    const selectedContextsList = document.getElementById('selectedContextsList');
    if (!selectedContextsList) return;
    
    if (this.selectedContexts.size === 0) {
        selectedContextsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>暂无已选中的上下文</p>
                <p class="text-muted">在左侧列表或树状图中选择上下文后，会显示在这里</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    const selectedContextsArray = Array.from(this.selectedContexts);
    
    // 获取已选中上下文的详细信息
    const selectedContextsData = this.contexts.filter(context => 
        this.selectedContexts.has(context.id)
    );
    
    // 按类型分组显示
    const groupedByType = {};
    selectedContextsData.forEach(context => {
        const type = context.type || '未知类型';
        if (!groupedByType[type]) {
            groupedByType[type] = [];
        }
        groupedByType[type].push(context);
    });
    
    // 渲染分组列表
    Object.keys(groupedByType).forEach(type => {
        const contextsOfType = groupedByType[type];
        html += `
            <div class="selected-contexts-group">
                <div class="group-header">
                    <i class="fas ${this.getContextIcon(type)}"></i>
                    <span class="group-title">${type}</span>
                    <span class="group-count">${contextsOfType.length} 个</span>
                </div>
                <div class="group-items">
        `;
        
        contextsOfType.forEach(context => {
            const isCurrent = context.id === this.selectedNodeId;
            const name = context.name || context.title || '未命名';
            const date = this.formatDate(context.updated_at || context.created_at);
            
            html += `
                <div class="selected-context-item ${isCurrent ? 'current' : ''}" 
                     data-context-id="${context.id}"
                     onclick="novelGenerator.handleContextClick('${context.id}')">
                    <div class="selected-context-icon">
                        <i class="fas ${this.getContextIcon(type)}"></i>
                    </div>
                    <div class="selected-context-info">
                        <div class="selected-context-title">${name}</div>
                        <div class="selected-context-meta">
                            <span class="selected-context-date">${date}</span>
                            ${isCurrent ? '<span class="current-badge">当前</span>' : ''}
                        </div>
                    </div>
                    <div class="selected-context-actions">
                        <button class="btn-icon" onclick="novelGenerator.removeFromSelection('${context.id}')" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    selectedContextsList.innerHTML = html;
}

// 从选择中移除上下文
removeFromSelection(contextId) {
    event?.stopPropagation(); // 阻止事件冒泡
    console.log("❌ 从选择中移除上下文:", contextId);
    
    if (this.selectedContexts.has(contextId)) {
        this.selectedContexts.delete(contextId);
        this.updateNodeSelectionStyle(contextId);
        this.updateSelectionCount();
        
        // 重新渲染已选中上下文列表
        this.renderSelectedContexts();
    }
}

bindContextMenuEvents() {
        // 获取右键菜单元素
        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu) {
            console.error("右键菜单元素不存在，无法绑定事件");
            return; 
        }
        
        // 移除现有的事件监听器
        if (this.handleContextMenuClick) {
            contextMenu.removeEventListener('click', this.handleContextMenuClick);
        }
        
        // 添加新的事件监听器
        this.handleContextMenuClick = (e) => {
            const menuItem = e.target.closest('.context-menu-item');
            
            if (menuItem && contextMenu.style.display === 'block') {
                const action = menuItem.dataset.action;
                
                // 阻止事件冒泡和默认行为
                e.stopPropagation();
                e.preventDefault();
                
                // 立即调用处理方法
                this.handleContextMenuItemClick(action);
            }
        };
        
        // 绑定事件监听器
        contextMenu.addEventListener('click', this.handleContextMenuClick);
    }
    

    
    async loadContexts() {
        const contextList = document.getElementById('contextList');
        if (!contextList) {
            console.error("上下文列表容器未找到");
            return;
        }
        
        // 显示加载状态
        contextList.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i> 正在加载上下文...
            </div>
        `;
        
        try {
            // 首先尝试获取树状结构
            const treeResponse = await fetch(`${this.serverUrl}/api/contexts/tree`);
            if (treeResponse.ok) {
                const treeData = await treeResponse.json();
                console.log("📂 上下文树状结构数据:", treeData);
                if (treeData.success && treeData.tree && Array.isArray(treeData.tree)) {
                    this.contextTree = treeData.tree;
                    // 检查树状结构中的父子关系
                    // this.debugTreeStructure(this.contextTree);
                    // 渲染树状图
                    this.renderTreeVisualization();
                    
                    // 同时加载普通列表用于左侧面板
                    const listResponse = await fetch(`${this.serverUrl}/api/contexts`);
                    if (listResponse.ok) {
                        this.contexts = await listResponse.json();
                        this.renderContexts();
                    }
                    return;
                }
            }
            
            // 如果树状结构不可用，使用普通列表
            const response = await fetch(`${this.serverUrl}/api/contexts`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.contexts = await response.json();
            console.log("📂 上下文列表:", this.contexts);
            // 使用普通列表构建树状结构
            this.contextTree = this.contexts;
            // 渲染树状图
            this.renderTreeVisualization();
            
            // 渲染左侧列表
            this.renderContexts();
        } catch (error) {
            console.error("加载上下文失败:", error);
            contextList.innerHTML = `
                <div class="error">
                    <i class="fas fa-exclamation-triangle"></i> 加载失败: ${error.message}
                </div>
            `;
        }
    }
    
    renderContexts() {
        const contextList = document.getElementById('contextList');
        if (!contextList) return;
        
        if (this.contexts.length === 0) {
            contextList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>暂无上下文数据</p>
                </div>
            `;
            return;
        }
        
        // 构建树状结构
        const tree = this.buildTreeStructure(this.contexts);
        
        // 渲染树状列表
        let html = this.renderTreeNodes(tree);
        
        contextList.innerHTML = html;
        this.updateSelectionCount();
    }
    
    // 构建树状结构
    buildTreeStructure(contexts) {
        // 创建节点映射
        console.log("构建树状结构:", contexts);
        const nodeMap = new Map();
        contexts.forEach(context => {
            nodeMap.set(context.id, {
                ...context,
                children: [],
                level: 0
            });
        });
        
        // 构建树
        const tree = [];
        nodeMap.forEach(node => {
            if (!node.parent_id || node.parent_id === null || node.parent_id === '') {
                // 根节点
                tree.push(node);
            } else {
                // 子节点
                const parent = nodeMap.get(node.parent_id);
                if (parent) {
                    parent.children.push(node);
                    node.level = parent.level + 1;
                } else {
                    // 父节点不存在，也作为根节点
                    tree.push(node);
                }
            }
        });
        
        return tree;
    }
    
    // 渲染树节点
    renderTreeNodes(nodes, level = 0) {
        let html = '';
        
        for (const node of nodes) {
            const isSelected = this.selectedContexts.has(node.id);
            const isExpanded = this.expandedNodes.has(node.id);
            // const hasChildren = node.children && node.children.length > 0;
            const name = node.name || node.title || '未命名';
            const type = node.type || '未知类型';
            
            // 计算缩进
            const indent = level * 20;
            
            html += `
                <div class="context-tree-item ${isSelected ? 'selected' : ''}" 
                     data-context-id="${node.id}"
                     data-level="${level}"
                     style="padding-left: ${indent}px;">
                    <div class="context-tree-item-content" onclick="novelGenerator.handleContextClick('${node.id}')">
                            <div class="context-tree-item-meta">
                                <div class="context-tree-item-icon">
                                    <i class="fas ${this.getContextIcon(type)}"></i>
                                </div>
                                <span class="context-tree-item-type">${type}</span>
                                <span class="context-tree-item-date">${this.formatDate(node.updated_at || node.created_at)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return html;
    }
    

    
    getContextIcon(type) {
        const iconMap = {
            '小说数据': 'fa-book',
            '人物设定': 'fa-user',
            '世界设定': 'fa-globe',
            '作品大纲': 'fa-list-alt',
            '事件细纲': 'fa-tasks',
            '会话历史': 'fa-history',
            '自定义': 'fa-file-alt'
        };
        
        return iconMap[type] || 'fa-file';
    }
    
    formatDate(dateString) {
        if (!dateString) return '未知时间';
        
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return '刚刚';
            if (diffMins < 60) return `${diffMins}分钟前`;
            if (diffHours < 24) return `${diffHours}小时前`;
            if (diffDays < 7) return `${diffDays}天前`;
            
            return date.toLocaleDateString('zh-CN');
        } catch (e) {
            return dateString;
        }
    }
    
    handleContextClick(contextId) {
        // 处理多选逻辑
        if (this.isCtrlPressed) {
            // Ctrl+点击：添加/移除选择
            this.toggleContextSelection(contextId);
        } else if (this.isShiftPressed && this.lastSelectedNodeId) {
            // Shift+点击：范围选择
            this.selectRange(this.lastSelectedNodeId, contextId);
        } else {
            // 普通点击：只选择当前节点，但不清除其他已选中的节点
            // 如果当前节点已经被选中，则取消选择它
            if (this.selectedContexts.has(contextId)) {
                this.toggleContextSelection(contextId);
            } else {
                // 如果当前节点没有被选中，则选择它
                this.toggleContextSelection(contextId);
            }
        }
        
        // 更新最后选择的节点
        this.lastSelectedNodeId = contextId;
        
        // 显示上下文详情
        this.showContextDetails(contextId);
        
        // 更新UI
        this.updateSelectionCount();
        
        // 如果当前显示的是已选中上下文选项卡，更新列表
        const selectedTabBtn = document.querySelector('.tab-btn[data-tab="selected"]');
        if (selectedTabBtn && selectedTabBtn.classList.contains('active')) {
            this.renderSelectedContexts();
        }
    }
    
    // 更新树状图，以指定节点对应的根节点展开
    updateTreeWithRootNode(nodeId) {
        // 设置当前根节点ID
        this.currentRootNodeId = this.findRootNodeId(nodeId);
        
        // 重新渲染树状图
        this.renderTreeVisualization();
    }
    
    // 查找节点对应的根节点ID
    findRootNodeId(nodeId) {
        if (!this.contexts || this.contexts.length === 0) {
            return nodeId;
        }
        
        // 查找节点
        const node = this.contexts.find(c => c.id === nodeId);
        if (!node) {
            return nodeId;
        }
        
        // 如果节点没有父节点，它就是根节点
        if (!node.parent_id || node.parent_id === null || node.parent_id === '') {
            return nodeId;
        }
        
        // 递归查找根节点
        return this.findRootNodeIdRecursive(nodeId, new Set());
    }
    
    // 递归查找根节点ID
    findRootNodeIdRecursive(nodeId, visited) {
        // 防止循环引用
        if (visited.has(nodeId)) {
            return nodeId;
        }
        visited.add(nodeId);
        
        // 查找节点
        const node = this.contexts.find(c => c.id === nodeId);
        if (!node) {
            return nodeId;
        }
        
        // 如果节点没有父节点，它就是根节点
        if (!node.parent_id || node.parent_id === null || node.parent_id === '') {
            return nodeId;
        }
        
        // 递归查找父节点的根节点
        return this.findRootNodeIdRecursive(node.parent_id, visited);
    }
    
    toggleContextSelection(contextId) {
        if (this.selectedContexts.has(contextId)) {
            // 取消选择节点：只取消选中当前节点
            this.selectedContexts.delete(contextId);
            console.log("❌ 取消选择上下文:", contextId);
        } else {
            // 选择节点：只选中当前节点，不再递归选中子节点
            this.selectedContexts.add(contextId);
            console.log("✅ 选择上下文:", contextId);
        }
        // 更新UI样式 - 只更新当前节点
        this.updateNodeSelectionStyle(contextId);
        // 更新UI状态
        this.updateSelectionCount();
    }
    
clearSelection() {
    // 清除所有选择
    this.selectedContexts.forEach(contextId => {
        this.selectedContexts.delete(contextId);
        this.updateNodeSelectionStyle(contextId);
    });
    this.selectedContexts.clear();
    
    // 清除树状图中的节点高亮
    if (this.treeG) {
        this.treeG.selectAll('.tree-node circle.selected').classed('selected', false);
        this.treeG.selectAll('.tree-node circle.highlighted').classed('highlighted', false);
    }
    
    // 更新UI状态
    this.updateSelectionCount();
    
    // 如果当前显示的是已选中上下文选项卡，更新列表
    const selectedTabBtn = document.querySelector('.tab-btn[data-tab="selected-contexts"]');
    if (selectedTabBtn && selectedTabBtn.classList.contains('active')) {
        this.renderSelectedContexts();
    }
    
    console.log("🗑️ 已清除所有选择和高亮");
}
    
    selectRange(startNodeId, endNodeId) {
        // 获取两个节点之间的所有节点
        const nodesInRange = this.getNodesBetween(startNodeId, endNodeId);
        
        // 选择范围内的所有节点
        nodesInRange.forEach(nodeId => {
            if (!this.selectedContexts.has(nodeId)) {
                this.selectedContexts.add(nodeId);
                this.updateNodeSelectionStyle(nodeId);
            }
        });
    }
    
    getNodesBetween(startNodeId, endNodeId) {
        // 获取所有节点ID的扁平列表
        const allNodeIds = this.getAllNodeIds();
        
        // 查找两个节点的索引
        const startIndex = allNodeIds.indexOf(startNodeId);
        const endIndex = allNodeIds.indexOf(endNodeId);
        
        if (startIndex === -1 || endIndex === -1) {
            return [startNodeId, endNodeId].filter(id => id);
        }
        
        // 获取范围内的节点
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        
        return allNodeIds.slice(start, end + 1);
    }
    
    getAllNodeIds() {
        // 从上下文树中获取所有节点ID
        const nodeIds = [];
        
        const collectNodeIds = (nodes) => {
            for (const node of nodes) {
                nodeIds.push(node.id);
                if (node.children && node.children.length > 0) {
                    collectNodeIds(node.children);
                }
            }
        };
        
        if (this.contextTree && this.contextTree.length > 0) {
            collectNodeIds(this.contextTree);
        } else if (this.contexts && this.contexts.length > 0) {
            // 如果树状结构不可用，使用扁平列表
            return this.contexts.map(context => context.id);
        }
        
        return nodeIds;
    }
    
    updateNodeSelectionStyle(contextId) {
        // 更新左侧列表中的节点样式
        const contextElement = document.querySelector(`[data-context-id="${contextId}"]`);
        if (contextElement) {
            if (this.selectedContexts.has(contextId)) {
                contextElement.classList.add('selected');
            } else {
                contextElement.classList.remove('selected');
            }
        }
        // 更新已选中上下文列表中的节点样式
        const selectedContextItem = document.querySelector(`.selected-context-item[data-context-id="${contextId}"]`);
        if (selectedContextItem) {
            if (this.selectedContexts.has(contextId)) {
                selectedContextItem.classList.add('selected');
                // 如果当前节点是选中的上下文，添加current类
                if (contextId === this.selectedNodeId) {
                    selectedContextItem.classList.add('current');
                } else {
                    selectedContextItem.classList.remove('current');
                }
            } else {
                selectedContextItem.classList.remove('selected');
                selectedContextItem.classList.remove('current');
            }
        }
        // 更新树状图中的节点高亮
        this.updateTreeNodeHighlight(contextId);
    }
    
    // 更新树状图节点高亮
    updateTreeNodeHighlight(contextId) {
        if (!this.treeG) return;
        // 查找对应的树节点
        const treeNode = this.treeG.selectAll('.tree-node').filter(d => d.data.id === contextId);
        console.log("🔍 更新树状图节点高亮:", contextId, treeNode.empty() ? "未找到节点" : "找到节点");
        if (!treeNode.empty()) {
            const circle = treeNode.select('circle');
            if (this.selectedContexts.has(contextId)) {
                // 选中状态：添加selected和highlighted类
                circle.classed('selected', true);
                circle.classed('highlighted', true);
            } else {
                // 取消选中状态：移除selected和highlighted类
                circle.classed('selected', false);
                circle.classed('highlighted', false);
                // 恢复默认样式
                circle.attr('stroke-width', 2)
                      .attr('stroke', '#fff');
            }
        }
    }
    
    async showContextDetails(contextId) {
        console.log("🔍 显示上下文详情:", contextId);
        
        const detailsContainer = document.getElementById('contextDetails');
        const itemsContainer = document.getElementById('contextItems');
        
        if (!detailsContainer || !itemsContainer) {
            console.error("❌ 详情容器未找到");
            return;
        }
        
        // 显示加载状态
        detailsContainer.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i> 正在加载详情...
            </div>
        `;
        itemsContainer.innerHTML = '';
        
        try {
            const response = await fetch(`${this.serverUrl}/api/context/${contextId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const context = await response.json();
            console.log("📄 上下文详情:", context);
            
            // 显示基本信息
            let detailsHtml = `
                <div class="context-details">
                    <div class="detail-item">
                        <div class="detail-label">名称</div>
                        <div class="detail-value">${context.name || '未命名'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">类型</div>
                        <div class="detail-value">${context.type || '未知类型'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">创建时间</div>
                        <div class="detail-value">${this.formatDate(context.created_at)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">更新时间</div>
                        <div class="detail-value">${this.formatDate(context.updated_at)}</div>
                    </div>
            `;
            
            // 显示内容预览
            if (context.content) {
                let contentPreview = '';
                if (Array.isArray(context.content)) {
                    contentPreview = context.content.map(item => {
                        if (typeof item === 'object' && item.content) {
                            return item.content.substring(0, 100) + (item.content.length > 100 ? '...' : '');
                        }
                        return String(item).substring(0, 100) + (String(item).length > 100 ? '...' : '');
                    }).join('<br>');
                } else {
                    contentPreview = String(context.content).substring(0, 200) + 
                                   (String(context.content).length > 200 ? '...' : '');
                }
                
                detailsHtml += `
                    <div class="detail-item">
                        <div class="detail-label">内容预览</div>
                        <div class="detail-value">${contentPreview}</div>
                    </div>
                `;
            }
            
            detailsHtml += '</div>';
            detailsContainer.innerHTML = detailsHtml;
            
            // 显示条目列表（如果内容为数组）
            if (context.items && Array.isArray(context.items) && context.items.length > 0) {
                let itemsHtml = `
                    <div class="items-section">
                        <div class="section-header">
                            <h3><i class="fas fa-list"></i> 条目列表</h3>
                            <span class="badge">${context.items.length} 个条目</span>
                        </div>
                        <div class="items-list">
                `;
                
                for (const item of context.items) {
                    const itemId = item.id || '未知';
                    const itemContent = item.content || '无内容';
                    const itemDate = this.formatDate(item.created_at || item.updated_at);
                    
                    itemsHtml += `
                        <div class="item-card">
                            <div class="item-header">
                                <div class="item-title">条目 ${itemId}</div>
                                <div class="item-date">${itemDate}</div>
                            </div>
                            <div class="item-content">${itemContent}</div>
                        </div>
                    `;
                }
                
                itemsHtml += `
                        </div>
                    </div>
                `;
                itemsContainer.innerHTML = itemsHtml;
            } else if (context.content && Array.isArray(context.content)) {
                // 如果content本身就是数组
                let itemsHtml = `
                    <div class="items-section">
                        <div class="section-header">
                            <h3><i class="fas fa-list"></i> 内容条目</h3>
                            <span class="badge">${context.content.length} 个条目</span>
                        </div>
                        <div class="items-list">
                `;
                
                for (let i = 0; i < context.content.length; i++) {
                    const item = context.content[i];
                    const itemId = (typeof item === 'object' && item.id) ? item.id : `item_${i + 1}`;
                    const itemContent = (typeof item === 'object' && item.content) ? item.content : String(item);
                    const itemDate = (typeof item === 'object' && item.created_at) ? 
                                   this.formatDate(item.created_at) : '未知时间';
                    
                    itemsHtml += `
                        <div class="item-card">
                            <div class="item-header">
                                <div class="item-title">条目 ${itemId}</div>
                                <div class="item-date">${itemDate}</div>
                            </div>
                            <div class="item-content">${itemContent}</div>
                        </div>
                    `;
                }
                
                itemsHtml += `
                        </div>
                    </div>
                `;
                itemsContainer.innerHTML = itemsHtml;
            } else {
                itemsContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>此上下文没有条目数据</p>
                    </div>
                `;
            }
            
        } catch (error) {
            console.error("❌ 加载上下文详情失败:", error);
            detailsContainer.innerHTML = `
                <div class="error">
                    <i class="fas fa-exclamation-triangle"></i> 加载失败: ${error.message}
                </div>
            `;
        }
    }
    
    updateSelectionCount() {
        const selectedCountElement = document.getElementById('selectedCount');
        if (selectedCountElement) {
            selectedCountElement.textContent = this.selectedContexts.size;
        }
        
        // 同时更新选项卡徽章
        const selectedTabBadge = document.getElementById('selectedTabBadge');
        if (selectedTabBadge) {
            selectedTabBadge.textContent = this.selectedContexts.size;
        }
    }
    

    
    updateUIState() {
        // 更新选择计数
        this.updateSelectionCount();
    }
    
    // sendMessage方法已移除，因为聊天面板已删除
    
    addMessage(type, content, isTemporary = false) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date();
        
        const messageElement = document.createElement('div');
        messageElement.id = messageId;
        messageElement.className = `message message-${type}`;
        
        const timeStr = timestamp.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        const sender = type === 'user' ? '你' : 'AI助手';
        
        messageElement.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${sender}</span>
                <span class="message-time">${timeStr}</span>
            </div>
            <div class="message-content">${content}</div>
        `;
        
        // 如果是临时消息（如思考中），添加到末尾但标记为临时
        if (isTemporary) {
            messageElement.classList.add('temporary');
            chatMessages.appendChild(messageElement);
        } else {
            // 移除所有临时消息
            const tempMessages = chatMessages.querySelectorAll('.message.temporary');
            tempMessages.forEach(msg => msg.remove());
            
            // 添加新消息
            chatMessages.appendChild(messageElement);
            
            // 保存到消息历史
            this.messages.push({
                id: messageId,
                type: type,
                content: content,
                timestamp: timestamp
            });
            
            // 更新消息计数
            this.updateMessageCount();
        }
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    updateLastMessage(content) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        // 查找最后一个临时消息
        const lastMessage = chatMessages.querySelector('.message.temporary:last-child');
        if (lastMessage) {
            // 更新内容并移除临时标记
            const contentElement = lastMessage.querySelector('.message-content');
            if (contentElement) {
                contentElement.innerHTML = content;
            }
            lastMessage.classList.remove('temporary');
            
            // 保存到消息历史
            const messageId = lastMessage.id;
            const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
            if (messageIndex !== -1) {
                this.messages[messageIndex].content = content;
            }
        } else {
            // 如果没有临时消息，创建一个新的AI消息
            this.addMessage('ai', content);
        }
    }
    
    filterContexts(searchTerm) {
        const contextList = document.getElementById('contextList');
        if (!contextList) return;
        
        if (!searchTerm || searchTerm.trim() === '') {
            // 如果搜索词为空，显示所有上下文
            this.renderContexts();
            return;
        }
        
        const term = searchTerm.toLowerCase().trim();
        const filteredContexts = this.contexts.filter(context => {
            const name = (context.name || context.title || '').toLowerCase();
            const type = (context.type || '').toLowerCase();
            const content = context.content ? 
                (Array.isArray(context.content) ? 
                    context.content.map(item => 
                        (typeof item === 'object' && item.content ? item.content : String(item))
                    ).join(' ') 
                    : String(context.content)
                ).toLowerCase() 
                : '';
            
            return name.includes(term) || 
                   type.includes(term) || 
                   content.includes(term);
        });
        
        console.log(`🔍 搜索 "${term}"，找到 ${filteredContexts.length} 个结果`);
        
        if (filteredContexts.length === 0) {
            contextList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>未找到匹配"${searchTerm}"的上下文</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        for (const context of filteredContexts) {
            const isSelected = this.selectedContexts.has(context.id);
            const name = context.name || context.title || '未命名';
            const type = context.type || '未知类型';
            
            html += `
                <div class="context-item ${isSelected ? 'selected' : ''}" 
                     data-context-id="${context.id}"
                     onclick="novelGenerator.handleContextClick('${context.id}')">
                    <div class="context-item-icon">
                        <i class="fas ${this.getContextIcon(type)}"></i>
                    </div>
                    <div class="context-item-info">
                        <div class="context-item-title">${name}</div>
                        <div class="context-item-meta">
                            <span class="context-item-type">${type}</span>
                            <span class="context-item-date">${this.formatDate(context.updated_at || context.created_at)}</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        contextList.innerHTML = html;
        this.updateSelectionCount();
    }
    
    showModal(title, content) {
        const modal = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalBody');
        
        console.log("📋 显示模态框，查找元素:", {
            modal: modal ? '找到' : '未找到',
            modalTitle: modalTitle ? '找到' : '未找到',
            modalContent: modalContent ? '找到' : '未找到'
        });
        
        if (!modal || !modalTitle || !modalContent) {
            console.error("❌ 模态框元素未找到");
            console.error("❌ modal元素:", modal);
            console.error("❌ modalTitle元素:", modalTitle);
            console.error("❌ modalContent元素:", modalContent);
            console.error("❌ 尝试查找的元素ID: modalOverlay, modalTitle, modalBody");
            return;
        }
        
        // 使用innerHTML而不是textContent来支持HTML标签
        modalTitle.innerHTML = title;
        modalContent.innerHTML = content;
        modal.style.display = 'flex';
        
        // 阻止背景滚动
        document.body.style.overflow = 'hidden';
        
        console.log("✅ 模态框显示成功");
    }
    
    hideModal() {
        const modal = document.getElementById('modalOverlay');
        if (!modal) return;
        
        modal.style.display = 'none';
        
        // 恢复背景滚动
        document.body.style.overflow = 'auto';
    }
    
    
    
    // 添加树状图控制方法 - 移除所有动画效果
    zoomIn() {
        if (this.treeSvg && this.treeZoom) {
            // 直接调用，没有任何动画
            this.treeSvg.call(this.treeZoom.scaleBy, 1.2);
        }
    }
    
    zoomOut() {
        if (this.treeSvg && this.treeZoom) {
            // 直接调用，没有任何动画
            this.treeSvg.call(this.treeZoom.scaleBy, 0.8);
        }
    }
    
    resetZoom() {
        if (this.treeSvg && this.treeZoom) {
            // 直接调用，没有任何动画
            this.treeSvg.call(this.treeZoom.transform, d3.zoomIdentity);
        }
    }
    
    centerTree() {
        if (this.treeSvg && this.treeZoom && this.treeG) {
            // 获取树状图的边界
            const bbox = this.treeG.node().getBBox();
            const centerX = this.containerWidth / 2 - (bbox.x + bbox.width / 2);
            const centerY = this.containerHeight / 2 - (bbox.y + bbox.height / 2);
            
            // 直接调用，没有任何动画
            this.treeSvg.call(
                this.treeZoom.transform,
                d3.zoomIdentity.translate(centerX, centerY).scale(0.8)
            );
        }
    }

    initContextMenu() {
        // 获取右键菜单元素
        this.contextMenu = document.getElementById('contextMenu');
        if (!this.contextMenu) {
            console.warn("⚠️ 右键菜单元素不存在");
            return;
        }
        // 获取树状图容器
        const treeContainer = document.getElementById('treeContainer');
        if (!treeContainer) {
            console.warn("⚠️ 树状图容器不存在，无法初始化右键菜单");
            return;
        }
        // 移除现有的事件监听器
        treeContainer.removeEventListener('contextmenu', this.handleTreeContextMenu);
        
        // 添加新的右键菜单事件监听器
        this.handleTreeContextMenu = (event) => {
            console.log("🖱️ 树状图右键菜单事件触发");
            event.preventDefault();
            event.stopPropagation();
            
            // 检查是否点击在节点上
            const target = event.target;
            console.log("🎯 右键点击目标:", target.tagName, target.className);
            
            const treeNode = target.closest('.tree-node');
            
            if (treeNode) {
                // 获取节点ID
                const nodeId = treeNode.dataset.nodeId;
                console.log("🎯 右键点击节点:", nodeId, "节点元素:", treeNode);
                
                // 显示右键菜单
                this.showContextMenu(event.clientX, event.clientY, nodeId);
            } else {
                // 点击在空白区域，显示根节点菜单
                console.log("🎯 右键点击空白区域");
                this.showContextMenu(event.clientX, event.clientY, null);
            }
        };
        
        treeContainer.addEventListener('contextmenu', this.handleTreeContextMenu);
        
        // 添加点击其他地方隐藏菜单的事件
        document.addEventListener('click', () => {
            console.log("🖱️ 点击其他地方，隐藏右键菜单");
            this.hideContextMenu();
        });
        
    }
    
    // 初始化提示框
    initTooltip() {
        // 如果提示框已经存在，先移除它
        const existingTooltip = document.getElementById('treeNodeTooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        // 创建提示框元素
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tree-node-details';
        this.tooltip.id = 'treeNodeTooltip';
        
        // 设置提示框内容结构
        this.tooltip.innerHTML = `
            <div class="tree-node-details-header">
                <div class="tree-node-details-title">节点详情</div>
                <button class="tree-node-details-close" onclick="novelGenerator.hideTooltip()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="tree-node-details-content">
                <div class="tree-node-details-item">
                    <span class="tree-node-details-label">名称:</span>
                    <span class="tree-node-details-value" id="tooltipNodeName">未命名</span>
                </div>
                <div class="tree-node-details-item">
                    <span class="tree-node-details-label">类型:</span>
                    <span class="tree-node-details-value" id="tooltipNodeType">未知类型</span>
                </div>
                <div class="tree-node-details-item">
                    <span class="tree-node-details-label">ID:</span>
                    <span class="tree-node-details-value" id="tooltipNodeId">未知</span>
                </div>
                <div class="tree-node-details-item">
                    <span class="tree-node-details-label">创建时间:</span>
                    <span class="tree-node-details-value" id="tooltipNodeDate">未知</span>
                </div>
                <div class="tree-node-details-item">
                    <span class="tree-node-details-label">内容预览:</span>
                    <span class="tree-node-details-value" id="tooltipNodeContent">无内容</span>
                </div>
            </div>
        `;
        
        // 将提示框添加到body中，而不是treeContainer中
        // 这样可以避免被treeContainer清空
        document.body.appendChild(this.tooltip);
    }
    
    // 显示提示框
    showTooltip(nodeData, x, y) {
        // 如果提示框未初始化，尝试重新初始化
        if (!this.tooltip) {
            this.initTooltip();
            if (!this.tooltip) {
                return;
            }
        }
        
        // 清除之前的超时
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
        
        // 设置当前提示框节点ID
        this.currentTooltipNodeId = nodeData.id;
        
        // 安全地更新提示框内容
        try {
            // 使用querySelector从tooltip元素内部查找元素，而不是document.getElementById
            const nameElement = this.tooltip.querySelector('#tooltipNodeName');
            const typeElement = this.tooltip.querySelector('#tooltipNodeType');
            const idElement = this.tooltip.querySelector('#tooltipNodeId');
            const dateElement = this.tooltip.querySelector('#tooltipNodeDate');
            const contentElement = this.tooltip.querySelector('#tooltipNodeContent');
            
            if (nameElement) {
                nameElement.textContent = nodeData.name || nodeData.title || '未命名';
            }
            if (typeElement) {
                typeElement.textContent = nodeData.type || '未知类型';
            }
            if (idElement) {
                idElement.textContent = nodeData.id || '未知';
            }
            if (dateElement) {
                dateElement.textContent = this.formatDate(nodeData.created_at || nodeData.updated_at) || '未知';
            }
            if (contentElement) {
                let contentPreview = '无内容';
                if (nodeData.content) {
                    if (Array.isArray(nodeData.content)) {
                        contentPreview = nodeData.content.map(item => {
                            if (typeof item === 'object' && item.content) {
                                return item.content.substring(0, 50) + (item.content.length > 50 ? '...' : '');
                            }
                            return String(item).substring(0, 50) + (String(item).length > 50 ? '...' : '');
                        }).join('<br>');
                    } else {
                        contentPreview = String(nodeData.content).substring(0, 100) + 
                                       (String(nodeData.content).length > 100 ? '...' : '');
                    }
                }
                contentElement.innerHTML = contentPreview;
            }
        } catch (error) {
            console.error("❌ 更新提示框内容失败:", error);
            return;
        }
        
        // 设置提示框位置
        const tooltipWidth = this.tooltip.offsetWidth || 300;
        const tooltipHeight = this.tooltip.offsetHeight || 200;
        const containerRect = this.tooltip.parentElement ? this.tooltip.parentElement.getBoundingClientRect() : {
            right: window.innerWidth,
            bottom: window.innerHeight,
            left: 0,
            top: 0
        };
        
        // 计算位置，确保提示框不会超出容器边界
        let posX = x + 15;
        let posY = y + 15;
        
        // 如果提示框会超出右侧边界，调整到左侧显示
        if (posX + tooltipWidth > containerRect.right - 20) {
            posX = x - tooltipWidth - 15;
        }
        
        // 如果提示框会超出底部边界，调整到上方显示
        if (posY + tooltipHeight > containerRect.bottom - 20) {
            posY = y - tooltipHeight - 15;
        }
        
        // 确保位置不会超出左侧和顶部边界
        posX = Math.max(20, posX);
        posY = Math.max(20, posY);
        
        // 应用位置
        this.tooltip.style.left = `${posX}px`;
        this.tooltip.style.top = `${posY}px`;
        
        // 显示提示框
        this.tooltip.classList.add('show');
        
        console.log("💡 显示提示框，节点:", nodeData.id, "位置:", posX, posY);
    }
    
    // 隐藏提示框
    hideTooltip() {
        if (!this.tooltip) return;
        
        // 清除超时
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
        
        // 隐藏提示框
        this.tooltip.classList.remove('show');
        this.currentTooltipNodeId = null;
        
        console.log("💡 隐藏提示框");
    }
    
    // 延迟隐藏提示框（用于鼠标移出时的延迟效果）
    scheduleHideTooltip() {
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
        }
        
        this.tooltipTimeout = setTimeout(() => {
            this.hideTooltip();
        }, 300); // 300毫秒延迟，避免快速移动时闪烁
    }
    
    // 取消延迟隐藏
    cancelHideTooltip() {
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
    }

    showContextMenu(x, y, nodeId) {
        console.log("📋 显示右键菜单，节点ID:", nodeId, "位置:", x, y);
        
        // 获取右键菜单元素
        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu) {
            console.warn("⚠️ 右键菜单元素不存在");
            return;
        }
        
        // 设置菜单位置
        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.style.display = 'block';
        contextMenu.style.zIndex = '1000';
        
        // 存储当前操作的节点ID
        this.currentContextMenuNodeId = nodeId;
        console.log("📋 存储当前菜单节点ID:", this.currentContextMenuNodeId);
        
        // 更新菜单项文本
        const menuItems = contextMenu.querySelectorAll('.context-menu-item');
        menuItems.forEach(item => {
            const action = item.dataset.action;
            
            switch(action) {
                case 'add-child':
                    item.innerHTML = nodeId ? 
                        `<i class="fas fa-plus-circle"></i> 添加子节点` : 
                        `<i class="fas fa-plus"></i> 添加根节点`;
                    break;
                case 'edit':
                    item.innerHTML = `<i class="fas fa-edit"></i> 编辑节点`;
                    item.style.display = nodeId ? 'block' : 'none';
                    break;
                case 'delete':
                    item.innerHTML = `<i class="fas fa-trash"></i> 删除节点`;
                    item.style.display = nodeId ? 'block' : 'none';
                    break;
                case 'expand':
                    item.innerHTML = `<i class="fas fa-expand"></i> 展开全部`;
                    break;
                case 'collapse':
                    item.innerHTML = `<i class="fas fa-compress"></i> 折叠全部`;
                    break;
            }
        });
        
        console.log("✅ 右键菜单显示完成，菜单项数量:", menuItems.length);
    }

    hideContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
        this.currentContextMenuNodeId = null;
    }

    // 处理右键菜单项点击
    handleContextMenuItemClick(action) {
        console.log("🎯 handleContextMenuItemClick被调用，action:", action);
        console.log("🎯 当前菜单节点ID:", this.currentContextMenuNodeId, "类型:", typeof this.currentContextMenuNodeId);
        console.log("🎯 调用堆栈:", new Error().stack);
        
        // 保存当前菜单节点ID，因为hideContextMenu会清空它
        const savedNodeId = this.currentContextMenuNodeId;
        
        // 立即隐藏菜单
        this.hideContextMenu();
        
        // 根据action调用相应的方法，传递保存的节点ID
        switch(action) {
            case 'add-child':
                console.log("➕ 调用addContextNode()，保存的节点ID:", savedNodeId);
                this.addContextNode(savedNodeId);
                break;
            case 'edit':
                console.log("✏️ 调用editContextNode()，保存的节点ID:", savedNodeId);
                this.editContextNode(savedNodeId);
                break;
            case 'delete':
                console.log("🗑️ 调用deleteContextNode()，保存的节点ID:", savedNodeId);
                this.deleteContextNode(savedNodeId);
                break;
            default:
                console.error("❌ 未知的action:", action);
        }
    }

    async addContextNode(savedNodeId) {
        console.log("➕ 添加上下文节点...");
        console.log("保存的父节点ID:", savedNodeId, "类型:", typeof savedNodeId);
        
        // 显示添加节点的模态框，使用保存的节点ID
        this.showAddNodeModal(savedNodeId);
    }

    showAddNodeModal(parentId) {
        console.log("📋 显示添加节点模态框，父节点ID:", parentId, "类型:", typeof parentId);
        
        // 存储父节点ID到实例变量中，确保在submitAddNode中可用
        this.modalParentId = parentId;
        console.log("📋 存储modalParentId:", this.modalParentId);
        
        // 获取父节点类型（如果存在父节点）
        let parentType = '自定义';
        let isRootNode = !parentId || parentId === 'null' || parentId === 'undefined' || parentId === '';
        
        if (!isRootNode) {
            // 尝试从contextTree中查找父节点
            const parentNode = this.findNodeInTree(this.contextTree, parentId);
            if (parentNode) {
                parentType = parentNode.type || '自定义';
                console.log("📋 找到父节点，类型:", parentType);
            } else {
                // 如果树状结构中找不到，尝试从扁平列表中查找
                const flatParent = this.contexts.find(c => c.id === parentId);
                if (flatParent) {
                    parentType = flatParent.type || '自定义';
                    console.log("📋 从扁平列表中找到父节点，类型:", parentType);
                }
            }
        }
        
        // 根据是否是根节点生成不同的表单
        let typeFieldHtml = '';
        if (isRootNode) {
            // 根节点：显示可选择的类型下拉框
            typeFieldHtml = `
                <div class="form-group">
                    <label for="nodeType"><i class="fas fa-tag"></i> 节点类型</label>
                    <select id="nodeType" class="form-control">
                        <option value="小说数据">小说数据</option>
                        <option value="人物设定">人物设定</option>
                        <option value="世界设定">世界设定</option>
                        <option value="作品大纲">作品大纲</option>
                        <option value="事件细纲">事件细纲</option>
                        <option value="自定义">自定义</option>
                    </select>
                </div>
            `;
        } else {
            // 子节点：显示固定的父节点类型，不可选择
            typeFieldHtml = `
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> 节点类型</label>
                    <div class="form-control-static">
                        <strong>${parentType}</strong>
                        <input type="hidden" id="nodeType" value="${parentType}">
                    </div>
                </div>
            `;
        }
        
        // 生成联系上下文的树状多选下拉框
        const relatedContextsHtml = this.generateRelatedContextsSelect();
        
        const modalContent = `
            <div class="add-node-form">
                <div class="form-group">
                    <label for="nodeName"><i class="fas fa-font"></i> 节点名称</label>
                    <input type="text" id="nodeName" class="form-control" placeholder="请输入节点名称" value="新节点">
                </div>
                ${typeFieldHtml}
                <div class="form-group">
                    <label><i class="fas fa-link"></i> 联系上下文</label>
                    <div class="related-contexts-container">
                        ${relatedContextsHtml}
                    </div>
                </div>
                <div class="form-group">
                    <label for="nodeContent"><i class="fas fa-file-alt"></i> 节点内容</label>
                    <textarea id="nodeContent" class="form-control" rows="4" placeholder="请输入节点内容..."></textarea>
                </div>
                <div class="form-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn btn-secondary" onclick="novelGenerator.hideModal()">取消</button>
                    <button class="btn btn-primary" onclick="novelGenerator.submitAddNode()">添加节点</button>
                </div>
            </div>
        `;
        
        const modalTitle = parentId ? '<i class="fas fa-plus-circle"></i> 添加子节点' : '<i class="fas fa-plus"></i> 添加根节点';
        console.log("📋 模态框标题:", modalTitle, "是否为根节点:", isRootNode, "父节点类型:", parentType);
        this.showModal(modalTitle, modalContent);
        
        // 初始化树状多选下拉框
        this.initRelatedContextsSelect();
    }


    async submitAddNode() {
        const nodeName = document.getElementById('nodeName')?.value || '新节点';
        const nodeType = document.getElementById('nodeType')?.value || '自定义';
        const nodeContent = document.getElementById('nodeContent')?.value || '';
        // 获取选中的联系上下文ID
        const relatedContextIds = this.getSelectedRelatedContexts();
        try {
            // 处理parentId - 优先使用modalParentId，因为它是在showAddNodeModal中存储的
            let processedParentId = null;
            // 首先检查modalParentId
            if (this.modalParentId && 
                this.modalParentId !== 'null' && 
                this.modalParentId !== 'undefined' && 
                this.modalParentId !== '') {
                processedParentId = this.modalParentId;
            }
            // 其次检查当前菜单节点ID
            else if (this.currentContextMenuNodeId && 
                     this.currentContextMenuNodeId !== 'null' && 
                     this.currentContextMenuNodeId !== 'undefined' && 
                     this.currentContextMenuNodeId !== '') {
                processedParentId = this.currentContextMenuNodeId;
            }
            // 如果都没有，则为null（根节点）
            else {
                processedParentId = null;
            }
        // 获取选中上下文的内容信息（只要对应的节点内容）
        let contextInfoArray = [];
        if (relatedContextIds.length > 0) {
            // 获取选中上下文的内容
            const contextsData = await this.getRelatedContextsData(relatedContextIds);
            console.log("📋 选中上下文的内容信息:", contextsData);
            
            // 构建上下文信息数组，每个元素包含 {id, 节点类型, 节点内容}
            contextInfoArray = contextsData.map(context => {
                // 提取内容
                let content = '';
                if (Array.isArray(context.content)) {
                    content = context.content.map(item => {
                        if (typeof item === 'object' && item.content) {
                            return item.content;
                        }
                        return String(item);
                    }).join('\n');
                } else {
                    content = String(context.content || '');
                }
                
                // 使用节点的原始id作为context_info的id
                // 这样在发送给大模型时可以根据id去重
                return {
                    id: context.id, // 使用节点的原始id
                    type: context.type || '未知类型',
                    content: content
                };
            });
            
            console.log("📋 构建的上下文信息数组（包含id）:", contextInfoArray);
        }
            
            // 构建封装好的数据结构 - 按照用户要求封装
            // {节点名称， 节点类型， 上下文信息:[{节点类型,节点内容 }], 节点内容}
            const nodeData = {
                name: nodeName,
                type: nodeType,
                context_info: contextInfoArray, // 上下文信息数组
                content: nodeContent,
                parent_id: processedParentId // 保留parent_id用于树状结构
            };
            
            // 隐藏模态框，显示流式结果模态框
            this.hideModal();
            // 清空modalParentId
            this.modalParentId = null;
            // 显示流式结果模态框
            this.showStreamingResultModal(nodeName, nodeType, processedParentId, relatedContextIds.length);
            // 发送流式请求到后端
            await this.sendStreamingCreateRequest(nodeData, nodeName, processedParentId, relatedContextIds.length);
        } catch (error) {
            console.error("❌ 添加节点失败:", error);
            console.error("❌ 错误堆栈:", error.stack);
            // 清空modalParentId
            this.modalParentId = null;
            // 隐藏加载动画
            this.hideLoading();
            this.showModal('添加失败', `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>添加节点失败</h3>
                    <p>错误信息: ${error.message}</p>
                    <p>请检查:</p>
                    <ul>
                        <li>服务器是否正在运行 (${this.serverUrl})</li>
                        <li>API端点是否正确 (/api/context/create)</li>
                        <li>网络连接是否正常</li>
                        <li>查看浏览器控制台获取更多错误信息</li>
                    </ul>
                </div>
            `);
        }
    }
            

    showEditNodeModal(nodeData) {
        console.log("📋 显示编辑节点模态框:", nodeData);
        
        const modalContent = `
            <div class="edit-node-form">
                <div class="form-group">
                    <label for="editNodeName"><i class="fas fa-font"></i> 节点名称</label>
                    <input type="text" id="editNodeName" class="form-control" value="${nodeData.name || '未命名'}">
                </div>
                <div class="form-group">
                    <label for="editNodeType"><i class="fas fa-tag"></i> 节点类型</label>
                    <select id="editNodeType" class="form-control">
                        <option value="小说数据" ${nodeData.type === '小说数据' ? 'selected' : ''}>小说数据</option>
                        <option value="人物设定" ${nodeData.type === '人物设定' ? 'selected' : ''}>人物设定</option>
                        <option value="世界设定" ${nodeData.type === '世界设定' ? 'selected' : ''}>世界设定</option>
                        <option value="作品大纲" ${nodeData.type === '作品大纲' ? 'selected' : ''}>作品大纲</option>
                        <option value="事件细纲" ${nodeData.type === '事件细纲' ? 'selected' : ''}>事件细纲</option>
                        <option value="自定义" ${nodeData.type === '自定义' ? 'selected' : ''}>自定义</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="editNodeContent"><i class="fas fa-file-alt"></i> 节点内容</label>
                    <textarea id="editNodeContent" class="form-control" rows="4">${nodeData.content || ''}</textarea>
                </div>
                <div class="form-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn btn-secondary" onclick="novelGenerator.hideModal()">取消</button>
                    <button class="btn btn-primary" onclick="novelGenerator.submitEditNode('${nodeData.id}')">保存修改</button>
                </div>
            </div>
        `;
        
        this.showModal('<i class="fas fa-edit"></i> 编辑节点', modalContent);
    }

    async submitEditNode(nodeId) {
        console.log("📤 提交编辑节点:", nodeId);
        
        const nodeName = document.getElementById('editNodeName')?.value || '未命名';
        const nodeType = document.getElementById('editNodeType')?.value || '自定义';
        const nodeContent = document.getElementById('editNodeContent')?.value || '';
        
        console.log("编辑后的节点信息:", { nodeName, nodeType, nodeContent });
        
        try {
            // 构建请求数据
            const requestData = {
                name: nodeName,
                type: nodeType,
                content: nodeContent
            };
            
            console.log("📤 发送编辑节点请求:", requestData);
            
            // 发送请求到后端
            const response = await fetch(`${this.serverUrl}/api/context/${nodeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log("✅ 编辑节点成功:", result);
            
            // 隐藏模态框
            this.hideModal();
            
            // 刷新上下文
            await this.refreshContexts();
            
            // 显示成功消息
            this.showModal('<i class="fas fa-check-circle"></i> 编辑成功', `
                <div class="success-message">
                    <i class="fas fa-check-circle"></i>
                    <h3>节点编辑成功</h3>
                    <p>${nodeName} 已成功更新。</p>
                </div>
            `);
            
        } catch (error) {
            console.error("❌ 编辑节点失败:", error);
            this.showModal('<i class="fas fa-exclamation-triangle"></i> 编辑失败', `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>编辑节点失败</h3>
                    <p>错误信息: ${error.message}</p>
                </div>
            `);
        }
    }

    async editContextNode(savedNodeId) {
        console.log("✏️ editContextNode被调用，保存的节点ID:", savedNodeId, "类型:", typeof savedNodeId);
        
        // 使用保存的节点ID
        const nodeId = savedNodeId;
        
        if (!nodeId) {
            console.error("❌ 没有选中的节点，无法编辑");
            this.showModal('<i class="fas fa-exclamation-triangle"></i> 编辑失败', `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>无法编辑节点</h3>
                    <p>错误信息: 没有选中的节点</p>
                    <p>请先右键点击一个节点，然后选择"编辑节点"。</p>
                </div>
            `);
            return;
        }
        
        console.log("✏️ 编辑节点:", nodeId, "服务器URL:", this.serverUrl);
        
        // 检查服务器是否运行
        if (!this.isServerRunning) {
            console.error("❌ 服务器未运行，无法编辑节点");
            this.showModal('编辑失败', `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>服务器未连接</h3>
                    <p>错误信息: 服务器未运行</p>
                    <p>请先启动服务器再尝试编辑节点。</p>
                </div>
            `);
            return;
        }
        
        // 显示加载动画
        this.showLoading('正在加载节点详情...');
        
        try {
            console.log(`🌐 尝试获取节点详情: ${this.serverUrl}/api/context/${nodeId}`);
            
            // 获取节点详情
            const response = await fetch(`${this.serverUrl}/api/context/${nodeId}`, {
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            console.log("📡 节点详情响应状态:", response.status, response.statusText);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("❌ 获取节点详情HTTP错误:", response.status, errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            const nodeData = await response.json();
            console.log("📄 节点详情数据:", nodeData);
            
            // 显示编辑模态框
            this.showEditNodeModal(nodeData);
            
        } catch (error) {
            console.error("❌ 获取节点详情失败:", error);
            console.error("❌ 错误堆栈:", error.stack);
            
            this.showModal('编辑失败', `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>无法编辑节点</h3>
                    <p>错误信息: ${error.message}</p>
                    <p>请检查:</p>
                    <ul>
                        <li>服务器是否正在运行 (${this.serverUrl})</li>
                        <li>API端点是否正确 (/api/context/{id})</li>
                        <li>节点ID是否存在 (${nodeId})</li>
                        <li>网络连接是否正常</li>
                        <li>查看浏览器控制台获取更多错误信息</li>
                    </ul>
                </div>
            `);
        } finally {
            // 隐藏加载动画
            this.hideLoading();
        }
    }

    async deleteContextNode(savedNodeId) {
        console.log("🗑️ 删除节点，保存的节点ID:", savedNodeId, "类型:", typeof savedNodeId);
        
        if (!savedNodeId) {
            console.warn("⚠️ 没有选中的节点，无法删除");
            this.showModal('<i class="fas fa-exclamation-triangle"></i> 删除失败', `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>无法删除节点</h3>
                    <p>错误信息: 没有选中的节点</p>
                    <p>请先右键点击一个节点，然后选择"删除节点"。</p>
                </div>
            `);
            return;
        }
        
        console.log("🗑️ 删除节点:", savedNodeId);
        
        // 显示确认对话框
        this.showModal('<i class="fas fa-exclamation-triangle"></i> 确认删除', `
            <div class="confirm-message">
                <p class="mb-4" style="font-size: 1.05rem; line-height: 1.6; color: #495057;">
                    您确定要删除这个节点吗？此操作不可撤销。<br>
                    <span class="text-danger fw-medium">
                    <i class="fas fa-sitemap me-1"></i>如果节点包含子节点，所有子节点将被级联删除
                    </span>
                </p>
                <div class="confirm-actions" style="display: flex; gap: 12px; justify-content: flex-end; flex-wrap: nowrap; margin-top: 1.25rem;">
                    <button class="btn btn-secondary" onclick="novelGenerator.hideModal()">取消</button>
                    <button class="btn btn-danger" onclick="novelGenerator.confirmDeleteNode('${savedNodeId}')">确认删除</button>
                </div>
            </div>
        `);
    }

    // 获取节点的所有子节点ID（包括孙子节点等）
    getAllChildNodeIds(nodeId, treeData = null) {
        console.log("🔍 获取节点", nodeId, "的所有子节点ID");
        
        if (!treeData) {
            treeData = this.contextTree;
        }
        
        if (!treeData || !Array.isArray(treeData)) {
            console.warn("⚠️ 树状数据无效，无法获取子节点");
            return [];
        }
        
        const allChildIds = [];
        
        // 收集所有子节点ID的递归函数
        const collectAllChildIds = (children, result) => {
            for (const child of children) {
                result.push(child.id);
                if (child.children && Array.isArray(child.children)) {
                    collectAllChildIds(child.children, result);
                }
            }
        };
        
        // 递归查找子节点
        const findChildren = (nodes, targetId) => {
            for (const node of nodes) {
                if (node.id === targetId) {
                    // 找到目标节点，获取其所有子节点
                    if (node.children && Array.isArray(node.children)) {
                        collectAllChildIds(node.children, allChildIds);
                    }
                    return true;
                }
                
                // 如果当前节点不是目标节点，递归查找其子节点
                if (node.children && Array.isArray(node.children)) {
                    if (findChildren(node.children, targetId)) {
                        return true;
                    }
                }
            }
            return false;
        };
        
        findChildren(treeData, nodeId);
        
        console.log("📋 节点", nodeId, "的所有子节点ID:", allChildIds);
        return allChildIds;
    }
    
    // 从扁平列表中获取节点的所有子节点ID
    getAllChildNodeIdsFromFlatList(nodeId) {
        console.log("🔍 从扁平列表获取节点", nodeId, "的所有子节点ID");
        
        if (!this.contexts || !Array.isArray(this.contexts)) {
            console.warn("⚠️ 上下文数据无效，无法获取子节点");
            return [];
        }
        
        const allChildIds = [];
        
        // 递归查找子节点
        const findChildrenRecursive = (parentId) => {
            const children = this.contexts.filter(node => {
                const parentIdStr = node.parent_id ? String(node.parent_id) : '';
                const targetIdStr = parentId ? String(parentId) : '';
                return parentIdStr === targetIdStr;
            });
            
            for (const child of children) {
                allChildIds.push(child.id);
                findChildrenRecursive(child.id);
            }
        };
        
        findChildrenRecursive(nodeId);
        
        console.log("📋 节点", nodeId, "的所有子节点ID（从扁平列表）:", allChildIds);
        return allChildIds;
    }
    
    // 递归删除节点及其所有子节点
    async deleteNodeRecursively(nodeId) {
        console.log("🗑️ 递归删除节点:", nodeId);
        
        try {
            // 首先获取所有子节点ID
            let childIds = [];
            
            // 尝试从树状结构获取子节点
            if (this.contextTree && this.contextTree.length > 0) {
                childIds = this.getAllChildNodeIds(nodeId, this.contextTree);
            }
            
            // 如果从树状结构没找到，尝试从扁平列表获取
            if (childIds.length === 0 && this.contexts && this.contexts.length > 0) {
                childIds = this.getAllChildNodeIdsFromFlatList(nodeId);
            }
            
            console.log("👶 需要删除的子节点数量:", childIds.length, "子节点ID:", childIds);
            
            // 先删除所有子节点（从最深层开始）
            if (childIds.length > 0) {
                console.log("🗑️ 开始删除子节点...");
                
                // 由于子节点可能也有子节点，我们需要确保正确的删除顺序
                // 我们可以先删除所有子节点，因为API应该会处理级联删除
                // 但为了安全起见，我们可以按层级删除
                
                // 简单实现：直接删除所有子节点
                for (const childId of childIds) {
                    console.log("🗑️ 删除子节点:", childId);
                    try {
                        const response = await fetch(`${this.serverUrl}/api/context/${childId}`, {
                            method: 'DELETE'
                        });
                        
                        if (!response.ok) {
                            console.warn(`⚠️ 删除子节点 ${childId} 失败: HTTP ${response.status}`);
                        } else {
                            console.log("✅ 子节点删除成功:", childId);
                        }
                    } catch (error) {
                        console.error(`❌ 删除子节点 ${childId} 失败:`, error);
                    }
                }
            }
            
            // 最后删除父节点
            console.log("🗑️ 删除父节点:", nodeId);
            const response = await fetch(`${this.serverUrl}/api/context/${nodeId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log("✅ 父节点删除成功:", result);
            
            return result;
            
        } catch (error) {
            console.error("❌ 递归删除节点失败:", error);
            throw error;
        }
    }

    async confirmDeleteNode(nodeId) {
        console.log("✅ 确认删除节点:", nodeId);
        
        try {
            // 使用递归删除方法
            const result = await this.deleteNodeRecursively(nodeId);
            console.log("✅ 删除节点成功:", result);
            
            // 隐藏模态框
            this.hideModal();
            
            // 刷新上下文
            await this.refreshContexts();
            
            // 显示成功消息
            const childCount = await this.getChildNodeCount(nodeId);
            const message = childCount > 0 ? 
                `节点及其 ${childCount} 个子节点已成功删除。` : 
                '节点已成功删除。';
            
            this.showModal('删除成功', `
                <div class="success-message">
                    <p>${message}</p>
                </div>
            `);
            
        } catch (error) {
            console.error("❌ 删除节点失败:", error);
            this.showModal('<i class="fas fa-exclamation-triangle"></i> 删除失败', `
                <div class="error-message">
                    <p>错误信息: ${error.message}</p>
                    <p>请检查网络连接或服务器状态。</p>
                </div>
            `);
        }
    }
    
    async refreshContexts() {
        console.log("🔄 刷新上下文...");
        
        
        // 显示加载状态
        const contextList = document.getElementById('contextList');
        if (contextList) {
            contextList.innerHTML = `
                <div class="loading">
                    <i class="fas fa-spinner fa-spin"></i> 正在刷新上下文...
                </div>
            `;
        }
        
        // 清空上下文详情
        const contextDetails = document.getElementById('contextDetails');
        const contextItems = document.getElementById('contextItems');
        if (contextDetails) contextDetails.innerHTML = '';
        if (contextItems) contextItems.innerHTML = '';
        
        // 清空选择
        this.selectedContexts.clear();
        this.updateSelectionCount();
    
        // 重新加载上下文
        await this.loadContexts();
    
        console.log("✅ 上下文刷新完成");
    }



    // 获取节点的子节点数量
    async getChildNodeCount(nodeId) {
        try {
            // 尝试从树状结构获取
            if (this.contextTree && this.contextTree.length > 0) {
                const childIds = this.getAllChildNodeIds(nodeId, this.contextTree);
                return childIds.length;
            }
            
            // 尝试从扁平列表获取
            if (this.contexts && this.contexts.length > 0) {
                const childIds = this.getAllChildNodeIdsFromFlatList(nodeId);
                return childIds.length;
            }
            
            return 0;
        } catch (error) {
            console.error("❌ 获取子节点数量失败:", error);
            return 0;
        }
    }

    initTreeVisualization() {
        const treeContainer = document.getElementById('treeContainer');
        if (!treeContainer) {
            console.warn("⚠️ 树状图容器不存在");
            return;
        }
        
        // 先清空容器
        treeContainer.innerHTML = '';
        
        // 使用更可靠的方法获取容器尺寸
        // 首先确保容器有明确的尺寸
        const ensureContainerSize = () => {
            // 获取父容器尺寸
            const parentContainer = treeContainer.parentElement;
            let parentWidth = 0;
            let parentHeight = 0;
            
            if (parentContainer) {
                parentWidth = parentContainer.clientWidth || 0;
                parentHeight = parentContainer.clientHeight || 0;
            }
            
            // 使用父容器尺寸或默认尺寸
            const containerWidth = treeContainer.clientWidth || parentWidth || this.treeWidth;
            const containerHeight = treeContainer.clientHeight || parentHeight || this.treeHeight;
            
            // 如果容器尺寸仍然为0，使用默认尺寸并设置CSS
            if (containerWidth <= 0 || containerHeight <= 0) {
                console.warn("⚠️ 容器尺寸为0，使用默认尺寸并设置CSS");
                treeContainer.style.width = `${this.treeWidth}px`;
                treeContainer.style.height = `${this.treeHeight}px`;
                treeContainer.style.minHeight = '400px';
                treeContainer.style.minWidth = '600px';
                
                return {
                    width: this.treeWidth,
                    height: this.treeHeight
                };
            }
            
            return {
                width: containerWidth,
                height: containerHeight
            };
        };
        
        const containerSize = ensureContainerSize();
        const actualWidth = containerSize.width;
        const actualHeight = containerSize.height;
        
        // 创建SVG容器
        const svg = d3.select(treeContainer)
            .append('svg')
            .attr('width', actualWidth)
            .attr('height', actualHeight)
            .attr('class', 'tree-svg')
            .style('background-color', 'var(--bg-color)');
        
        // 创建分组用于绘制
        const g = svg.append('g')
            .attr('transform', `translate(${this.treeMargin.left},${this.treeMargin.top})`);
        
        // 创建拖动行为 - 完全禁用缩放，允许大范围拖动
        const zoomBehavior = d3.zoom()
            .scaleExtent([1, 1]) // 完全禁用缩放，锁定缩放比例为1
            .translateExtent([[-actualWidth * 2, -actualHeight * 2], [actualWidth * 3, actualHeight * 3]]) // 允许大范围拖动
            .on('zoom', (event) => {
                // 只应用平移变换，不应用缩放
                g.attr('transform', `translate(${event.transform.x},${event.transform.y})`);
            });
        
        // 应用zoom行为到SVG
        svg.call(zoomBehavior);
        
        // 存储引用
        this.treeSvg = svg;
        this.treeG = g;
        this.treeZoom = zoomBehavior;
        this.containerWidth = actualWidth;
        this.containerHeight = actualHeight;
    }

    renderTreeVisualization() {
        console.log("🎨 渲染树状图...");
        if (!this.treeG) {
            console.warn("⚠️ 无法渲染树状图：树状图未初始化");
            // 尝试重新初始化
            this.initTreeVisualization();
            // 延迟重新渲染
            setTimeout(() => this.renderTreeVisualization(), 200);
            return;
        }
        
        // 清空现有内容
        this.treeG.selectAll('*').remove();
        
        // 如果没有数据，显示空状态
        if (!this.contextTree || this.contextTree.length === 0) {
            console.warn("⚠️ 没有树状图数据可渲染");
            
            // 显示空状态消息
            this.treeG.append('text')
                .attr('x', this.containerWidth / 2 - this.treeMargin.left)
                .attr('y', this.containerHeight / 2 - this.treeMargin.top)
                .attr('text-anchor', 'middle')
                .attr('class', 'tree-empty-message')
                .attr('fill', 'var(--text-secondary)')
                .attr('font-size', '16px')
                .attr('font-weight', '500')
                .text('暂无上下文数据，请添加节点');
            
            // 显示添加节点提示
            this.treeG.append('text')
                .attr('x', this.containerWidth / 2 - this.treeMargin.left)
                .attr('y', this.containerHeight / 2 - this.treeMargin.top + 30)
                .attr('text-anchor', 'middle')
                .attr('class', 'tree-empty-hint')
                .attr('fill', 'var(--text-tertiary)')
                .attr('font-size', '14px')
                .text('右键点击空白区域添加根节点');
            
            // 更新节点计数为0
            this.updateTreeNodeCount(0);
            return;
        }
        
        
        // 计算可用空间
        const availableWidth = this.containerWidth - this.treeMargin.left - this.treeMargin.right;
        const availableHeight = this.containerHeight - this.treeMargin.top - this.treeMargin.bottom;
        
        console.log(`📐 可用空间: ${availableWidth}x${availableHeight}, 节点数: ${this.contextTree.length}`);
        
        // 准备树状布局
        const treeLayout = d3.tree()
            .size([availableHeight, availableWidth])
            .separation((a, b) => {
                // 增加节点间距
                return (a.parent === b.parent ? 1.5 : 2);
            });
        
        // 转换数据为D3树格式
        const root = this.buildD3Tree(this.contextTree);
        
        if (!root) {
            console.error("❌ 无法构建D3树结构");
            // 显示错误消息
            this.treeG.append('text')
                .attr('x', this.containerWidth / 2 - this.treeMargin.left)
                .attr('y', this.containerHeight / 2 - this.treeMargin.top)
                .attr('text-anchor', 'middle')
                .attr('class', 'tree-error-message')
                .attr('fill', 'var(--error-color)')
                .attr('font-size', '14px')
                .text('树状图数据格式错误，请检查数据');
            return;
        }
        
        
        // 计算节点位置
        const treeData = treeLayout(root);
        
        // 计算树状图的实际边界
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        treeData.descendants().forEach(d => {
            if (d.x < minX) minX = d.x;
            if (d.x > maxX) maxX = d.x;
            if (d.y < minY) minY = d.y;
            if (d.y > maxY) maxY = d.y;
        });
        
        
        // 计算缩放比例，使树状图适应可用空间
        const treeWidth = maxY - minY;
        const treeHeight = maxX - minX;
        
        
        // 如果树状图很小，使用较大的缩放
        let scale = 1;
        if (treeWidth > 0 && treeHeight > 0) {
            const scaleX = availableWidth / treeWidth;
            const scaleY = availableHeight / treeHeight;
            scale = Math.min(scaleX, scaleY, 1) * 0.7;  // 留出更多边距
        }
        
        // 计算偏移量，使树状图居中
        const offsetX = (availableWidth - treeWidth * scale) / 2 - minY * scale;
        const offsetY = (availableHeight - treeHeight * scale) / 2 - minX * scale;
        
        
        // 绘制连接线
        const links = this.treeG.selectAll('.tree-link')
            .data(treeData.links())
            .enter()
            .append('path')
            .attr('class', 'tree-link')
            .attr('d', d3.linkHorizontal()
                .x(d => d.y * scale + offsetX)
                .y(d => d.x * scale + offsetY))
            .attr('fill', 'none')
            // .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.6);
        
        // 绘制节点 - 确保节点位置固定
        const nodes = this.treeG.selectAll('.tree-node')
            .data(treeData.descendants())
            .enter()
            .append('g')
            .attr('class', 'tree-node')
            .attr('transform', d => `translate(${d.y * scale + offsetX},${d.x * scale + offsetY})`)
            .attr('data-node-id', d => d.data.id);
        
        // 添加节点圆圈 - 使用固定半径，不随悬停变化
        nodes.append('circle')
            .attr('r', this.nodeRadius)
            .attr('fill', d => this.getNodeColor(d.data.type))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('cursor', 'pointer')
            .attr('class', 'tree-node-circle')
            // 如果节点被选中，应用选中样式
            .classed('selected', d => this.selectedContexts.has(d.data.id))
            .classed('highlighted', d => this.selectedContexts.has(d.data.id));
        
        // 添加节点文本
        nodes.append('text')
            .attr('dy', '.31em')
            .attr('x', d => d.children ? -(this.nodeRadius + 5) : (this.nodeRadius + 5))
            .attr('text-anchor', d => d.children ? 'end' : 'start')
            .attr('class', 'tree-label')
            .attr('fill', 'var(--text-primary)')
            .attr('font-size', '12px')
            .attr('font-weight', '500')
            .attr('pointer-events', 'none')
            .text(d => d.data.name || d.data.title || '未命名');
        
        // 添加节点点击事件 - 使用更稳定的方式
        nodes.on('click', (event, d) => {
            event.stopPropagation(); // 阻止事件冒泡
            event.preventDefault(); // 阻止默认行为
            console.log("🖱️ 点击树节点:", d.data.id);
            
            // 立即处理点击，避免任何延迟
            setTimeout(() => {
                this.handleTreeNodeClick(d.data.id);
                this.renderSelectedContexts();
            }, 0);


        });
        
        // 添加节点悬停效果和提示框
        nodes.on('mouseenter', (event, d) => {
            event.stopPropagation();
            
            const circle = d3.select(event.currentTarget).select('.tree-node-circle');
            const nodeId = d.data.id;
            
            // 如果节点没有被选中，才应用悬停样式
            if (!this.selectedContexts.has(nodeId)) {
                circle.attr('stroke-width', 3)
                      .attr('stroke', '#ff9800');
            }
            
            // 显示提示框
            this.showTooltip(d.data, event.clientX, event.clientY);
        })
        .on('mouseleave', (event, d) => {
            event.stopPropagation();
            
            const circle = d3.select(event.currentTarget).select('.tree-node-circle');
            const nodeId = d.data.id;
            
            // 如果是选中的节点，保持选中样式
            if (this.selectedContexts.has(nodeId)) {
                circle.attr('stroke-width', 4)
                      .attr('stroke', '#0084ff');
            } else {
                circle.attr('stroke-width', 2)
                      .attr('stroke', '#fff');
            }
            
            // 延迟隐藏提示框
            this.scheduleHideTooltip();
        });
        // 更新节点计数显示
        this.updateTreeNodeCount(treeData.descendants().length);
    }
    
    updateTreeNodeCount(count) {
        const treeNodeCountElement = document.getElementById('treeNodeCount');
        if (treeNodeCountElement) {
            treeNodeCountElement.textContent = count;
        }
    }

    buildD3Tree(treeData) {
        if (!treeData || treeData.length === 0) {
            console.warn("⚠️ 树状数据为空");
            return null;
        }
        console.log("🌳 :", treeData);
        // 检查数据是否已经是树状结构（包含children字段）
        const firstNode = treeData[0];
        if (firstNode && firstNode.children !== undefined) {
            console.log("🌳 数据已经是树状结构，直接使用");
            
            // 如果指定了当前根节点ID，查找该节点作为根节点
            if (this.currentRootNodeId) {
                console.log("🌳 查找指定根节点:", this.currentRootNodeId);
                const targetNode = this.findNodeInTree(treeData, this.currentRootNodeId);
                if (targetNode) {
                    console.log("🌳 找到指定根节点:", targetNode.name);
                    return d3.hierarchy(this.convertTreeToD3Node(targetNode));
                } else {
                    console.warn("⚠️ 未找到指定根节点，使用默认根节点");
                }
            }
            
            // 如果只有一个根节点，直接返回
            if (treeData.length === 1) {
                console.log("🌳 单个根节点:", treeData[0].name);
                return d3.hierarchy(this.convertTreeToD3Node(treeData[0]));
            }
            
            // 如果有多个根节点，创建虚拟根节点
            console.log("🌳 创建虚拟根节点，包含", treeData.length, "个子节点");
            const virtualRoot = {
                id: 'virtual_root',
                name: '所有上下文',
                type: 'root',
                children: treeData.map(node => this.convertTreeToD3Node(node))
            };
            
            return d3.hierarchy(virtualRoot);
        }
        
        
        // 如果指定了当前根节点ID，查找该节点作为根节点
        if (this.currentRootNodeId) {
            console.log("🌳 查找指定根节点:", this.currentRootNodeId);
            const targetNode = treeData.find(node => node.id === this.currentRootNodeId);
            if (targetNode) {
                console.log("🌳 找到指定根节点:", targetNode.name);
                // 构建以该节点为根的子树
                const subtree = this.buildSubtreeFromFlatList(targetNode, treeData);
                return d3.hierarchy(subtree);
            } else {
                console.warn("⚠️ 未找到指定根节点，使用默认根节点");
            }
        }
        
        // 找到根节点（没有父节点的节点）
        const rootNodes = treeData.filter(node => !node.parent_id || node.parent_id === null || node.parent_id === '');
        
        if (rootNodes.length === 0 && treeData.length > 0) {
            // 如果没有明确的根节点，使用第一个节点作为根
            console.log("🌳 使用第一个节点作为根节点");
            const root = this.convertToD3Node(treeData[0], treeData);
            return d3.hierarchy(root);
        }
        
        if (rootNodes.length === 1) {
            console.log("🌳 找到单个根节点:", rootNodes[0].name);
            const root = this.convertToD3Node(rootNodes[0], treeData);
            return d3.hierarchy(root);
        }
        
        // 如果有多个根节点，创建一个虚拟根节点
        console.log("🌳 创建虚拟根节点，包含", rootNodes.length, "个子节点");
        const virtualRoot = {
            id: 'virtual_root',
            name: '所有上下文',
            type: 'root',
            children: rootNodes.map(node => this.convertToD3Node(node, treeData))
        };
        
        return d3.hierarchy(virtualRoot);
    }
    
    // 在树状结构中查找节点
    findNodeInTree(treeData, nodeId) {
        for (const node of treeData) {
            if (node.id === nodeId) {
                return node;
            }
            if (node.children && Array.isArray(node.children)) {
                const found = this.findNodeInTree(node.children, nodeId);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }
    
    // 生成联系上下文的树状多选下拉框HTML - 现代化设计
    generateRelatedContextsSelect() {
        if (!this.contextTree || this.contextTree.length === 0) {
            return `
                <div class="tree-multiselect-empty">
                    <i class="fas fa-inbox"></i>
                    <p>暂无上下文数据</p>
                    <p class="text-muted">请先添加一些上下文</p>
                </div>
            `;
        }
        
        // 构建现代化的树状多选组件
        let html = `
            <div class="tree-multiselect" id="relatedContextsSelect">
                <div class="tree-multiselect-header">
                    <input type="text" 
                           class="tree-search-input" 
                           placeholder="搜索上下文..." 
                           id="treeSearchInput"
                           oninput="novelGenerator.filterTreeNodes(this.value)">
                    <div class="tree-multiselect-actions">
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="novelGenerator.selectAllTreeNodes()">
                            <i class="fas fa-check-square"></i> 全选
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="novelGenerator.deselectAllTreeNodes()">
                            <i class="fas fa-square"></i> 全不选
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="novelGenerator.expandAllTreeNodes()">
                            <i class="fas fa-expand"></i> 展开全部
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="novelGenerator.collapseAllTreeNodes()">
                            <i class="fas fa-compress"></i> 折叠全部
                        </button>
                    </div>
                </div>
                <div class="tree-multiselect-container" id="treeMultiselectContainer">
                    <div class="tree-multiselect-tree" id="relatedContextsTree">
        `;
        
        // 递归生成树节点 - 现代化设计
        const generateTreeNode = (node, level = 0) => {
            const hasChildren = node.children && node.children.length > 0;
            const nodeId = `context_${node.id}`;
            const nodeName = node.name || node.title || '未命名';
            const nodeType = node.type || '未知类型';
            const icon = this.getContextIcon(nodeType);
            
            let nodeHtml = `
                <div class="tree-node-item" data-level="${level}" data-node-id="${node.id}">
                    <div class="tree-node-content">
                        <label class="tree-node-checkbox">
                            <input type="checkbox" value="${node.id}" class="related-context-checkbox" id="${nodeId}">
                            <span class="tree-node-name">${nodeName}</span>
                        </label>
                        <span class="tree-node-type">${nodeType}</span>
            `;
            
            // 如果有子节点，添加展开/折叠按钮
            if (hasChildren) {
                nodeHtml += `
                        <button class="tree-node-toggle" onclick="novelGenerator.toggleTreeNode('${node.id}')" title="展开/折叠">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                `;
            }
            
            nodeHtml += `
                    </div>
            `;
            
            // 如果有子节点，添加子节点容器（默认展开）
            if (hasChildren) {
                nodeHtml += `<div class="tree-node-children expanded" id="children_${node.id}">`;
                for (const child of node.children) {
                    nodeHtml += generateTreeNode(child, level + 1);
                }
                nodeHtml += `</div>`;
            }
            
            nodeHtml += `</div>`;
            return nodeHtml;
        };
        
        // 生成所有根节点
        for (const node of this.contextTree) {
            html += generateTreeNode(node);
        }
        
        html += `
                    </div>
                </div>
                <div class="tree-multiselect-footer">
                    <div class="selected-count">
                        <i class="fas fa-check-circle"></i>
                        已选择: <span id="selectedContextsCount">0</span> 个上下文
                    </div>
                    <div class="selected-tags" id="selectedContextsTags">
                        <!-- 选中的上下文将在这里显示为标签 -->
                    </div>
                </div>
            </div>
        `;
        
        return html;
    }
    
    // 初始化树状多选下拉框
    initRelatedContextsSelect() {
        // 等待DOM渲染完成
        setTimeout(() => {
            // 绑定复选框变化事件
            const checkboxes = document.querySelectorAll('.related-context-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.addEventListener('change', (event) => {
                    this.handleTreeNodeCheckboxChange(event);
                });
            });
            
            // 初始化选中计数
            this.updateSelectedContexts();
        }, 100);
    }
    
    // 处理树节点复选框变化
    handleTreeNodeCheckboxChange(event) {
        const checkbox = event.target;
        const nodeId = checkbox.value;
        const isChecked = checkbox.checked;
        
        // 获取对应的树节点项
        const nodeItem = checkbox.closest('.tree-node-item');
        if (!nodeItem) return;
        

        
        // 更新父节点的选中状态（如果子节点状态变化）
        this.updateParentNodeState(nodeId);
        
        // 更新选中计数和显示
        this.updateSelectedContexts();
    }
    


    // 更新父节点的选中状态
    updateParentNodeState(nodeId) {
        // 查找父节点
        const nodeItem = document.querySelector(`.tree-node-item[data-node-id="${nodeId}"]`);
        if (!nodeItem) return;
        
        // 查找父容器
        const parentContainer = nodeItem.parentElement;
        if (!parentContainer || !parentContainer.classList.contains('tree-node-children')) return;
        
        // 获取父节点ID
        const parentNodeId = parentContainer.id.replace('children_', '');
        const parentNodeItem = document.querySelector(`.tree-node-item[data-node-id="${parentNodeId}"]`);
        if (!parentNodeItem) return;
        
        const parentCheckbox = parentNodeItem.querySelector('.related-context-checkbox');
        if (!parentCheckbox) return;
        
        // 获取所有子节点复选框
        const childCheckboxes = parentContainer.querySelectorAll('.related-context-checkbox');
        const childCount = childCheckboxes.length;
        
        if (childCount === 0) return;
        
        // 统计选中状态
        let checkedCount = 0;
        let indeterminateCount = 0;
        
        childCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                checkedCount++;
            } else if (checkbox.indeterminate) {
                indeterminateCount++;
            }
        });
        
        // 更新父节点复选框状态
        // 根据用户要求：选了子节点，不能把父节点选上
        // 所以即使所有子节点都选中，父节点也只显示为部分选中状态
        if (checkedCount === childCount) {
            // 所有子节点都选中：父节点显示为部分选中状态
            parentCheckbox.checked = false;
            parentCheckbox.indeterminate = true;
        } else if (checkedCount === 0 && indeterminateCount === 0) {
            // 没有子节点选中
            parentCheckbox.checked = false;
            parentCheckbox.indeterminate = false;
        } else {
            // 部分子节点选中
            parentCheckbox.checked = false;
            parentCheckbox.indeterminate = true;
        }
        
        // 递归更新更上层的父节点
        this.updateParentNodeState(parentNodeId);
    }
    

    
    // 全选树节点
    selectAllTreeNodes() {
        const checkboxes = document.querySelectorAll('.related-context-checkbox');
        // 首先，选中所有节点
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            checkbox.indeterminate = false;
        });
        // 更新选中计数
        this.updateSelectedContexts();
    }
    
    // 全不选树节点
    deselectAllTreeNodes() {
        const checkboxes = document.querySelectorAll('.related-context-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.indeterminate = false;
        });
        // 更新选中计数
        this.updateSelectedContexts();
    }
    
    // 过滤树节点
    filterTreeNodes(searchTerm) {
        const treeNodes = document.querySelectorAll('.tree-node-item');
        const searchLower = searchTerm.toLowerCase().trim();
        
        if (!searchTerm) {
            // 显示所有节点
            treeNodes.forEach(node => {
                node.style.display = 'flex';
                node.classList.remove('highlighted');
            });
            return;
        }
        
        treeNodes.forEach(node => {
            const label = node.querySelector('.tree-node-name');
            if (label) {
                const text = label.textContent || label.innerText;
                if (text.toLowerCase().includes(searchLower)) {
                    node.style.display = 'flex';
                    node.classList.add('highlighted');
                    // 确保父节点展开
                    this.expandParentNodes(node);
                } else {
                    node.style.display = 'none';
                    node.classList.remove('highlighted');
                }
            }
        });
    }
    
    // 展开父节点
    expandParentNodes(nodeElement) {
        let current = nodeElement;
        while (current) {
            const parentContainer = current.parentElement;
            if (parentContainer && parentContainer.classList.contains('tree-node-children')) {
                // 找到父节点的ID
                const parentId = parentContainer.id.replace('children_', '');
                const parentNode = document.querySelector(`[data-node-id="${parentId}"]`);
                if (parentNode) {
                    const toggleButton = parentNode.querySelector('.tree-node-toggle');
                    const childrenContainer = document.getElementById(`children_${parentId}`);
                    if (toggleButton && childrenContainer && !childrenContainer.classList.contains('expanded')) {
                        childrenContainer.classList.add('expanded');
                        const icon = toggleButton.querySelector('i');
                        if (icon) {
                            icon.className = 'fas fa-chevron-down';
                            toggleButton.classList.add('expanded');
                        }
                    }
                }
            }
            current = parentContainer ? parentContainer.parentElement : null;
        }
    }
    
    // 更新选中的上下文
    updateSelectedContexts() {
        const checkboxes = document.querySelectorAll('.related-context-checkbox:checked');
        const count = checkboxes.length;
        const countElement = document.getElementById('selectedContextsCount');
        const tagsElement = document.getElementById('selectedContextsTags');
        
        if (countElement) {
            countElement.textContent = count;
        }
        
        if (tagsElement) {
            if (count === 0) {
                tagsElement.innerHTML = '<span class="text-muted">未选择任何上下文</span>';
            } else {
                const selectedTags = [];
                checkboxes.forEach(checkbox => {
                    const nodeItem = checkbox.closest('.tree-node-item');
                    if (nodeItem) {
                        const nameElement = nodeItem.querySelector('.tree-node-name');
                        const typeElement = nodeItem.querySelector('.tree-node-type');
                        if (nameElement) {
                            const name = nameElement.textContent || nameElement.innerText;
                            const type = typeElement ? typeElement.textContent : '未知类型';
                            const icon = this.getContextIcon(type);
                            selectedTags.push(`
                                <span class="selected-tag" title="${type}">
                                    <i class="fas ${icon}"></i> ${name}
                                </span>
                            `);
                        }
                    }
                });
                
                tagsElement.innerHTML = selectedTags.join('');
            }
        }
    }
    
    // 获取选中的联系上下文ID
    getSelectedRelatedContexts() {
        const checkboxes = document.querySelectorAll('.related-context-checkbox:checked');
        const selectedIds = [];
        checkboxes.forEach(checkbox => {
            selectedIds.push(checkbox.value);
        });
        return selectedIds;
    }
    
    // 切换树节点展开/折叠状态
    toggleTreeNode(nodeId) {
        const childrenContainer = document.getElementById(`children_${nodeId}`);
        const toggleButton = document.querySelector(`[data-node-id="${nodeId}"] .tree-node-toggle`);
        
        if (!childrenContainer || !toggleButton) {
            console.warn(`⚠️ 未找到节点 ${nodeId} 的子容器或切换按钮`);
            return;
        }
        
        const isExpanded = childrenContainer.classList.contains('expanded');
        const icon = toggleButton.querySelector('i');
        
        if (isExpanded) {
            // 折叠
            childrenContainer.classList.remove('expanded');
            toggleButton.classList.remove('expanded');
            if (icon) {
                icon.className = 'fas fa-chevron-right';
            }
        } else {
            // 展开
            childrenContainer.classList.add('expanded');
            toggleButton.classList.add('expanded');
            if (icon) {
                icon.className = 'fas fa-chevron-down';
            }
        }
        
        console.log(`🌳 切换节点 ${nodeId} 状态: ${isExpanded ? '折叠' : '展开'}`);
    }
    
    // 展开所有树节点
    expandAllTreeNodes() {
        const childrenContainers = document.querySelectorAll('.tree-node-children');
        const toggleButtons = document.querySelectorAll('.tree-node-toggle');
        
        childrenContainers.forEach(container => {
            container.classList.add('expanded');
        });
        
        toggleButtons.forEach(button => {
            button.classList.add('expanded');
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-chevron-down';
            }
        });
        
        console.log('🌳 展开所有树节点');
    }
    
    // 折叠所有树节点
    collapseAllTreeNodes() {
        const childrenContainers = document.querySelectorAll('.tree-node-children');
        const toggleButtons = document.querySelectorAll('.tree-node-toggle');
        
        childrenContainers.forEach(container => {
            container.classList.remove('expanded');
        });
        
        toggleButtons.forEach(button => {
            button.classList.remove('expanded');
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-chevron-right';
            }
        });
        
        console.log('🌳 折叠所有树节点');
    }
    
    // 获取选中上下文的内容数据
    async getRelatedContextsData(contextIds) {
        if (!contextIds || contextIds.length === 0) {
            return [];
        }
        
        const contextsData = [];
        
        for (const contextId of contextIds) {
            try {
                const response = await fetch(`${this.serverUrl}/api/context/${contextId}`);
                if (response.ok) {
                    const context = await response.json();
                    // 只提取我们需要的信息：ID、名称、类型和内容
                    contextsData.push({
                        id: context.id,
                        name: context.name || '未命名',
                        type: context.type || '未知类型',
                        content: context.content || ''
                    });
                } else {
                    console.warn(`⚠️ 无法获取上下文 ${contextId} 的详情: HTTP ${response.status}`);
                }
            } catch (error) {
                console.error(`❌ 获取上下文 ${contextId} 数据失败:`, error);
            }
        }
        
        return contextsData;
    }
    
    // 显示节点创建结果
    showNodeCreationResult(result, nodeName, parentId, relatedContextCount) {
        let resultHtml = `
            <div class="node-creation-result">
                <div class="result-details">
                    <div class="result-item">
                        <span class="result-label">操作状态:</span>
                        <span class="result-value ${result.success ? 'success' : 'error'}">
                            ${result.success ? '✅ 成功' : '❌ 失败'}
                        </span>
                    </div>
        `;
        
        if (result.success) {
            resultHtml += `
                    <div class="result-item">
                        <span class="result-label">节点名称:</span>
                        <span class="result-value">${nodeName}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">节点类型:</span>
                        <span class="result-value">${result.context_id || '未知'}</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">节点位置:</span>
                        <span class="result-value">${parentId ? '子节点' : '根节点'}</span>
                    </div>
            `;
            
            if (relatedContextCount > 0) {
                resultHtml += `
                    <div class="result-item">
                        <span class="result-label">关联上下文:</span>
                        <span class="result-value">${relatedContextCount} 个</span>
                    </div>
                `;
            }
            
            if (result.generated_content) {
                resultHtml += `
                    <div class="result-item">
                        <span class="result-label">内容:</span>
                        <span class="result-value">${result.generated_content}</span>
                    </div>
                `;
            }
            
            if (result.context_id) {
                resultHtml += `
                    <div class="result-item">
                        <span class="result-label">节点ID:</span>
                        <span class="result-value code">${result.context_id}</span>
                    </div>
                `;
            }
        } else {
            resultHtml += `
                    <div class="result-item">
                        <span class="result-label">错误信息:</span>
                        <span class="result-value error">${result.error || result.message || '未知错误'}</span>
                    </div>
            `;
        }
        
        this.showModal('<i class="fas fa-info-circle"></i> 节点创建结果', resultHtml);
    }
    
    
    // 过滤树节点
    filterTreeNodes(searchTerm) {
        const treeNodes = document.querySelectorAll('.tree-node-item');
        const searchLower = searchTerm.toLowerCase().trim();
        
        if (!searchTerm) {
            // 显示所有节点
            treeNodes.forEach(node => {
                node.style.display = 'block';
            });
            return;
        }
        
        treeNodes.forEach(node => {
            const label = node.querySelector('.tree-node-label');
            if (label) {
                const text = label.textContent || label.innerText;
                if (text.toLowerCase().includes(searchLower)) {
                    node.style.display = 'block';
                    // 确保父节点展开
                    this.expandParentNodes(node);
                } else {
                    node.style.display = 'none';
                }
            }
        });
    }
    
    // 展开父节点
    expandParentNodes(nodeElement) {
        let current = nodeElement;
        while (current) {
            const parentContainer = current.parentElement;
            if (parentContainer && parentContainer.classList.contains('tree-node-children')) {
                // 找到父节点的ID
                const parentId = parentContainer.id.replace('children_', '');
                const parentNode = document.querySelector(`[data-node-id="${parentId}"]`);
                if (parentNode) {
                    const toggleButton = parentNode.querySelector('.tree-node-toggle');
                    const childrenContainer = document.getElementById(`children_${parentId}`);
                    if (toggleButton && childrenContainer && childrenContainer.style.display === 'none') {
                        childrenContainer.style.display = 'block';
                        const icon = toggleButton.querySelector('i');
                        if (icon) {
                            icon.className = 'fas fa-chevron-down';
                        }
                    }
                }
            }
            current = parentContainer ? parentContainer.parentElement : null;
        }
    }
    
    // 展开所有树节点
    expandAllTreeNodes() {
        const childrenContainers = document.querySelectorAll('.tree-node-children');
        const toggleIcons = document.querySelectorAll('.tree-node-toggle i');
        
        childrenContainers.forEach(container => {
            container.style.display = 'block';
        });
        
        toggleIcons.forEach(icon => {
            icon.className = 'fas fa-chevron-down';
        });
    }
    
    // 折叠所有树节点
    collapseAllTreeNodes() {
        const childrenContainers = document.querySelectorAll('.tree-node-children');
        const toggleIcons = document.querySelectorAll('.tree-node-toggle i');
        
        childrenContainers.forEach(container => {
            container.style.display = 'none';
        });
        
        toggleIcons.forEach(icon => {
            icon.className = 'fas fa-chevron-right';
        });
    }
    
    // 从扁平列表构建以指定节点为根的子树
    buildSubtreeFromFlatList(rootNode, allNodes) {
        console.log("🌲 构建子树，根节点:", rootNode.id, rootNode.name);
        
        const d3Node = {
            id: rootNode.id,
            name: rootNode.name || rootNode.title || '未命名',
            type: rootNode.type || '未知类型',
            content: (node.content != undefined && node.content.length > 0) ? node.content[0].content : '未知内容',
            children: []
        };
        
        // 查找直接子节点
        const children = allNodes.filter(n => {
            const parentIdStr = n.parent_id ? String(n.parent_id) : '';
            const nodeIdStr = rootNode.id ? String(rootNode.id) : '';
            return parentIdStr === nodeIdStr;
        });
        
        console.log("👶 根节点", rootNode.id, "的直接子节点数量:", children.length);
        
        if (children.length > 0) {
            console.log("👶 直接子节点ID列表:", children.map(c => c.id));
            // 递归构建子树
            d3Node.children = children.map(child => this.buildSubtreeFromFlatList(child, allNodes));
        }
        
        return d3Node;
    }

    convertToD3Node(node, allNodes) {
        
        const d3Node = {
            id: node.id,
            name: node.name || node.title || '未命名',
            type: node.type || '未知类型',
            content: (node.content != undefined && node.content.length > 0) ? node.content[0].content : '未知内容',
            created_at: node.created_at || '未知时间',
            children: []
        };
        
        // 查找子节点 - 确保类型一致
        const children = allNodes.filter(n => {
            // 处理parent_id为null、undefined、空字符串的情况
            const parentId = n.parent_id;
            const nodeId = node.id;
            
            // 如果parent_id为null、undefined或空字符串，则不是子节点
            if (parentId === null || parentId === undefined || parentId === '') {
                return false;
            }
            // 将parent_id和node.id都转换为字符串进行比较
            const parentIdStr = String(parentId);
            const nodeIdStr = String(nodeId);
            return parentIdStr === nodeIdStr;
        });
        if (children.length > 0) {
            console.log("👶 子节点ID列表:", children.map(c => ({id: c.id, parent_id: c.parent_id})));
            d3Node.children = children.map(child => this.convertToD3Node(child, allNodes));
        }
        return d3Node;
    }

    convertTreeToD3Node(node) {
        console.log("🌳 转换树节点:", node.id, node.name);
        console.log("🌳 节点数据:", node);
        const d3Node = {
            id: node.id,
            name: node.name || node.title || '未命名',
            type: node.type || '未知类型',
            content: (node.content != undefined && node.content.length > 0) ? node.content[0].content : '未知内容',
            created_at: node.created_at || '未知时间',
            children: []
        };
        
        // 如果节点有子节点，递归转换
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
            console.log("👶 树节点", node.id, "的子节点数量:", node.children.length);
            d3Node.children = node.children.map(child => this.convertTreeToD3Node(child));
        }
        
        return d3Node;
    }

    // 从扁平列表构建完整的树状结构
    buildTreeFromFlatList(rootNode, allNodes) {
        console.log("🌲 从扁平列表构建树状结构，根节点:", rootNode.id, rootNode.name);
        
        const d3Node = {
            id: rootNode.id,
            name: rootNode.name || rootNode.title || '未命名',
            type: rootNode.type || '未知类型',
            children: []
        };
        
        // 查找直接子节点
        const children = allNodes.filter(n => {
            const parentIdStr = n.parent_id ? String(n.parent_id) : '';
            const nodeIdStr = rootNode.id ? String(rootNode.id) : '';
            return parentIdStr === nodeIdStr;
        });
        
        console.log("👶 根节点", rootNode.id, "的直接子节点数量:", children.length);
        
        if (children.length > 0) {
            console.log("👶 直接子节点ID列表:", children.map(c => c.id));
            // 递归构建子树
            d3Node.children = children.map(child => this.buildTreeFromFlatList(child, allNodes));
        }
        
        return d3Node;
    }


    // 扁平化树状结构
    flattenTree(treeData, result = []) {
        if (!treeData || !Array.isArray(treeData)) {
            return result;
        }
        
        treeData.forEach(node => {
            result.push(node);
            if (node.children && Array.isArray(node.children)) {
                this.flattenTree(node.children, result);
            }
        });
        
        return result;
    }

    getNodeColor(nodeType) {
        const colorMap = {
            '小说数据': '#4CAF50',
            '人物设定': '#2196F3',
            '世界设定': '#FF9800',
            '作品大纲': '#9C27B0',
            '事件细纲': '#F44336',
            '会话历史': '#607D8B',
            '自定义': '#795548'
        };
        
        return colorMap[nodeType] || '#9E9E9E';
    }

    //  在handleTreeNodeClick方法中，修复节点点击和高亮逻辑
    handleTreeNodeClick(nodeId) {
        console.log("🌳 处理树节点点击:", nodeId, "当前时间:", Date.now());

        // 防止重复点击导致的晃动 - 使用更严格的防抖动
        const now = Date.now();
        if (this.lastClickedNode === nodeId && now - this.lastClickTime < 500) {
            console.log("⏱️ 防止快速重复点击（防抖动），上次点击时间:", this.lastClickTime, "时间差:", now - this.lastClickTime);
            return;
        }

        this.lastClickedNode = nodeId;
        this.lastClickTime = now;
        
        // 清除之前的点击超时
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
        }
        
        // 设置新的点击超时
        this.clickTimeout = setTimeout(() => {
            console.log("⏱️ 重置点击状态");
            this.lastClickedNode = null;
            this.lastClickTime = 0;
        }, 500);

        // 选择对应的上下文
        this.handleContextClick(nodeId);

    }

    // 修改highlightTreeNode方法，添加节点高亮效果
    highlightTreeNode(nodeId) {
        if (!this.treeG) {
            console.warn("⚠️ 无法高亮节点：树状图未初始化");
            return;
        }
        
        // 清除之前选中的节点高亮
        this.treeG.selectAll('.tree-node circle.selected').classed('selected', false);
        this.treeG.selectAll('.tree-node circle.highlighted').classed('highlighted', false);
        
        // 高亮当前选中的节点
        const selectedNode = this.treeG.selectAll('.tree-node').filter(d => d.data.id === nodeId);
        if (!selectedNode.empty()) {
            selectedNode.select('circle').classed('selected', true);
            selectedNode.select('circle').classed('highlighted', true);
            
            // 更新选中节点ID
            this.selectedNodeId = nodeId;
            
            console.log("✅ 节点高亮成功:", nodeId);
        } else {
            console.warn("⚠️ 未找到要选中的节点:", nodeId);
        }
    }

    // ==================== AI辅助功能方法 ====================
    
    // 切换AI辅助面板显示/隐藏
    toggleAiAssistPanel() {
        const aiPanel = document.getElementById('aiAssistPanel');
        if (!aiPanel) return;
        
        if (aiPanel.style.display === 'none' || aiPanel.style.display === '') {
            this.showAiAssistPanel();
        } else {
            this.hideAiAssistPanel();
        }
    }
    
    // 显示AI辅助面板
    showAiAssistPanel() {
        const aiPanel = document.getElementById('aiAssistPanel');
        const aiPromptInput = document.getElementById('aiPromptInput');
        
        if (aiPanel) {
            aiPanel.style.display = 'block';
            
            // 更新AI面板中的上下文选择区域
            this.updateAiPanelContextSelection();
            
            // 聚焦到输入框
            if (aiPromptInput) {
                setTimeout(() => {
                    aiPromptInput.focus();
                }, 100);
            }
            
            // 更新状态消息
            this.updateStatusMessage('AI辅助面板已打开，输入指令后按Enter或点击生成按钮');
        }
    }
    
    // 隐藏AI辅助面板
    hideAiAssistPanel() {
        const aiPanel = document.getElementById('aiAssistPanel');
        if (aiPanel) {
            aiPanel.style.display = 'none';
            this.updateStatusMessage('AI辅助面板已关闭');
        }
    }
    
    // 更新AI面板中的上下文选择区域
    updateAiPanelContextSelection() {
        const contextSelectionGrid = document.getElementById('contextSelectionGrid');
        const selectedContextCount = document.getElementById('selectedContextCount');
        
        if (!contextSelectionGrid || !selectedContextCount) return;
        
        // 更新选中计数
        selectedContextCount.textContent = this.selectedContexts.size;
        
        // 如果没有选中的上下文，显示空状态
        if (this.selectedContexts.size === 0) {
            contextSelectionGrid.innerHTML = `
                <div class="empty-state">
                    <p>未选择任何上下文</p>
                </div>
            `;
            return;
        }
        
        // 获取选中的上下文数据
        const selectedContextsData = this.contexts.filter(context => 
            this.selectedContexts.has(context.id)
        );
        
        // 生成上下文卡片
        let html = '';
        selectedContextsData.forEach(context => {
            const name = context.name || context.title || '未命名';
            const type = context.type || '未知类型';
            const icon = this.getContextIcon(type);
            
            // 获取内容预览
            let contentPreview = '无内容';
            if (context.content) {
                if (Array.isArray(context.content)) {
                    contentPreview = context.content.map(item => {
                        if (typeof item === 'object' && item.content) {
                            return item.content.substring(0, 50) + (item.content.length > 50 ? '...' : '');
                        }
                        return String(item).substring(0, 50) + (String(item).length > 50 ? '...' : '');
                    }).join('<br>');
                } else {
                    contentPreview = String(context.content).substring(0, 100) + 
                                   (String(context.content).length > 100 ? '...' : '');
                }
            }
            
            html += `
                <div class="context-selection-card" data-context-id="${context.id}">
                    <div class="context-selection-card-header">
                        <div class="context-selection-card-icon">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="context-selection-card-title">${name}</div>
                    </div>
                    <div class="context-selection-card-content">${contentPreview}</div>
                    <button class="context-selection-card-remove" onclick="novelGenerator.removeContextFromAiPanel('${context.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        
        contextSelectionGrid.innerHTML = html;
    }
    
    // 从AI面板中移除上下文
    removeContextFromAiPanel(contextId) {
        event?.stopPropagation(); // 阻止事件冒泡
        
        // 从选中集合中移除
        if (this.selectedContexts.has(contextId)) {
            this.selectedContexts.delete(contextId);
            
            // 更新UI样式
            this.updateNodeSelectionStyle(contextId);
            
            // 更新AI面板中的上下文选择区域
            this.updateAiPanelContextSelection();
            
            // 更新选择计数
            this.updateSelectionCount();
            
            console.log("❌ 从AI面板中移除上下文:", contextId);
        }
    }
    
    // 重写handleContextClick方法，确保更新AI面板
    handleContextClick(contextId) {
        // 处理多选逻辑
        if (this.isCtrlPressed) {
            // Ctrl+点击：添加/移除选择
            this.toggleContextSelection(contextId);
        } else if (this.isShiftPressed && this.lastSelectedNodeId) {
            // Shift+点击：范围选择
            this.selectRange(this.lastSelectedNodeId, contextId);
        } else {
            // 普通点击：只选择当前节点，但不清除其他已选中的节点
            // 如果当前节点已经被选中，则取消选择它
            if (this.selectedContexts.has(contextId)) {
                this.toggleContextSelection(contextId);
            } else {
                // 如果当前节点没有被选中，则选择它
                this.toggleContextSelection(contextId);
            }
        }
        
        // 更新最后选择的节点
        this.lastSelectedNodeId = contextId;
        
        // 显示上下文详情
        this.showContextDetails(contextId);
        
        // 更新树状图，以该节点对应的根节点展开
        // this.updateTreeWithRootNode(contextId);
        
        // 更新UI
        this.updateSelectionCount();
        
        // 如果AI面板是打开的，更新其中的上下文选择区域
        const aiPanel = document.getElementById('aiAssistPanel');
        if (aiPanel && aiPanel.style.display === 'block') {
            this.updateAiPanelContextSelection();
        }
        
        // 如果当前显示的是已选中上下文选项卡，更新列表
        const selectedTabBtn = document.querySelector('.tab-btn[data-tab="selected"]');
        if (selectedTabBtn && selectedTabBtn.classList.contains('active')) {
            this.renderSelectedContexts();
        }
    }
    
    // 处理AI动作按钮点击
    handleAiAction(action) {
        const aiPromptInput = document.getElementById('aiPromptInput');
        if (!aiPromptInput) return;
        
        const actionTexts = {
            'continue': '请续写以下内容：',
            'improve': '请润色以下内容：',
            'summarize': '请总结以下内容：',
            'expand': '请扩展以下内容：',
            'dialogue': '请为以下内容添加对话：',
            'description': '请为以下内容添加描写：'
        };
        
        const actionText = actionTexts[action] || '请处理以下内容：';
        
        // 获取编辑器当前选中的文本
        const editor = document.getElementById('tiptapEditor');
        let selectedText = '';
        if (editor) {
            const selection = window.getSelection();
            if (selection && selection.toString().trim()) {
                selectedText = selection.toString();
            }
        }
        
        // 设置输入框内容
        if (selectedText) {
            aiPromptInput.value = `${actionText}\n\n${selectedText}`;
        } else {
            aiPromptInput.value = actionText;
        }
        
        // 聚焦到输入框
        aiPromptInput.focus();
        aiPromptInput.setSelectionRange(aiPromptInput.value.length, aiPromptInput.value.length);
    }
    
    // 生成AI内容 - ChatGPT风格对话框版本
    async generateAiContent() {
        const aiPromptInput = document.getElementById('aiPromptInput');
        if (!aiPromptInput) {
            console.error('AI对话框元素未找到');
            return;
        }
        const prompt = aiPromptInput.value.trim();
        if (!prompt) {
            this.showModal('输入提示', '<p>请输入指令或问题。</p>');
            return;
        }
        // 清空输入框
        aiPromptInput.value = '';
        
        // 显示加载状态
        this.showLoading('AI正在生成内容，请稍候...');
        
        try {
            // 获取选中的上下文
            const selectedContexts = Array.from(this.selectedContexts);
            // 构建请求数据
            const requestData = {
                prompt: prompt,
                selected_contexts: selectedContexts
            };
            console.log('发送AI生成请求:', requestData);
            
            // 发送请求到服务端
            const response = await fetch(`${this.serverUrl}/api/ai/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log('AI生成响应:', result);
            
            // 隐藏加载动画
            this.hideLoading();
            
            // 显示AI生成的内容在模态框中
            this.showAiResponseModal(result);
            
            // 返回结果
            return result;
            
        } catch (error) {
            console.error('AI生成失败:', error);
            this.hideLoading();
            this.showModal('AI生成失败', `<p>错误信息: ${error.message}</p>`);
        }
    }
    
    // 显示AI响应模态框
    showAiResponseModal(result) {
        // 提取AI生成的内容
        let aiContent = '';
        if (result.generated_content) {
            aiContent = result.generated_content;
        } else if (result.content) {
            aiContent = result.content;
        } else if (result.message) {
            aiContent = result.message;
        } else {
            aiContent = JSON.stringify(result, null, 2);
        }
        
        // 格式化内容
        const formattedContent = this.formatAiResponse(aiContent);
        
        // 构建模态框内容，包含应用和取消按钮
        const modalContent = `
            <div class="ai-response-modal">
                <div class="ai-response-content" id="aiResponseContent">
                    ${formattedContent}
                </div>
                <div class="ai-response-actions">
                    <button class="btn btn-primary" onclick="novelGenerator.applyAiResponseFromModal()">
                        <i class="fas fa-check"></i> 应用
                    </button>
                    <button class="btn btn-secondary" onclick="novelGenerator.hideModal()">
                        <i class="fas fa-times"></i> 取消
                    </button>
                </div>
            </div>
        `;
        
        // 显示模态框
        this.showModal('AI生成结果', modalContent);
        
        // 存储当前AI响应内容
        this.currentAiResponse = aiContent;
    }
    
    // 从模态框应用AI响应
    applyAiResponseFromModal() {
        if (!this.currentAiResponse) {
            console.error('没有可应用的AI响应');
            return;
        }
        
        // 插入文本到编辑器顶部
        this.insertTextToEditorTop(this.currentAiResponse);
        
        // 隐藏模态框
        this.hideModal();
        
        // 清空存储的响应
        this.currentAiResponse = null;
        
        // 显示成功消息
        this.updateStatusMessage('AI内容已成功应用到编辑器顶部');
    }
    
    // 插入文本到编辑器顶部
    insertTextToEditorTop(text) {
        const editor = document.getElementById('tiptapEditor');
        if (!editor) {
            console.error('编辑器元素未找到');
            return;
        }
        
        // 这里需要根据实际的编辑器实现来插入文本到顶部
        // 由于我们不知道editor.js的具体实现，这里提供一个通用方法
        if (editor.isContentEditable) {
            // 对于contenteditable元素，插入到开头
            const range = document.createRange();
            const selection = window.getSelection();
            
            // 选择编辑器的开头
            range.setStart(editor, 0);
            range.collapse(true);
            
            // 移除所有现有选择
            selection.removeAllRanges();
            selection.addRange(range);
            
            // 插入文本
            if (document.execCommand && document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, text);
            } else {
                // 创建文本节点并插入
                const textNode = document.createTextNode(text);
                range.insertNode(textNode);
                
                // 将光标移动到插入的文本后面
                range.setStartAfter(textNode);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } else {
            // 如果不是contenteditable，尝试直接在前面添加
            editor.value = text + (editor.value || '');
        }
    }
    

    

    
    // 应用AI消息到编辑器
    applyAiMessage(messageId) {
        const messageElement = document.getElementById(messageId);
        if (!messageElement) return;
        
        // 获取消息内容（去除HTML标签）
        const contentElement = messageElement.querySelector('.ai-message-content');
        if (!contentElement) return;
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentElement.innerHTML;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';
        
        // 插入文本到编辑器
        this.insertTextToEditor(plainText);
        
        // 显示成功提示
        this.showModal('应用成功', '<p>AI生成的内容已成功应用到编辑器。</p>');
    }
    
    // 插入文本到编辑器
    insertTextToEditor(text) {
        const editor = document.getElementById('tiptapEditor');
        if (!editor) {
            console.error('编辑器元素未找到');
            return;
        }
        
        // 这里需要根据实际的编辑器实现来插入文本
        // 由于我们不知道editor.js的具体实现，这里提供一个通用方法
        if (document.execCommand && document.queryCommandSupported('insertText')) {
            // 使用execCommand插入文本
            document.execCommand('insertText', false, text);
        } else if (editor.isContentEditable) {
            // 对于contenteditable元素
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
            } else {
                // 如果没有选中文本，直接追加到末尾
                editor.textContent += text;
            }
        }
    }
    
    // 转义HTML特殊字符
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 格式化AI响应
    formatAiResponse(content) {
        if (typeof content !== 'string') {
            content = JSON.stringify(content, null, 2);
        }
        
        // 简单的Markdown格式转换
        let formatted = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        return formatted;
    }
    
    // 格式化AI响应
    formatAiResponse(content) {
        if (typeof content !== 'string') {
            content = JSON.stringify(content, null, 2);
        }
        
        // 简单的Markdown格式转换
        let formatted = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        return formatted;
    }
    
    // 应用AI响应到编辑器
    applyAiResponse() {
        const aiResponseContent = document.getElementById('aiResponseContent');
        const editor = document.getElementById('tiptapEditor');
        
        if (!aiResponseContent || !editor) {
            console.error('编辑器或AI响应内容未找到');
            return;
        }
        
        // 获取纯文本内容（去除HTML标签）
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = aiResponseContent.innerHTML;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';
        
        // 这里需要根据实际的编辑器实现来插入文本
        // 由于我们不知道editor.js的具体实现，这里提供一个通用方法
        if (document.execCommand && document.queryCommandSupported('insertText')) {
            // 使用execCommand插入文本
            document.execCommand('insertText', false, plainText);
        } else if (editor.isContentEditable) {
            // 对于contenteditable元素
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(plainText));
            } else {
                // 如果没有选中文本，直接追加到末尾
                editor.textContent += plainText;
            }
        }
        
        // 隐藏AI响应
        document.getElementById('aiResponse').style.display = 'none';
        
        this.updateStatusMessage('AI内容已应用到编辑器');
    }
    
    // 丢弃AI响应
    discardAiResponse() {
        document.getElementById('aiResponse').style.display = 'none';
        this.updateStatusMessage('已丢弃AI响应');
    }
    
    // 更新状态消息
    updateStatusMessage(message) {
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        }
    }
    
    // ==================== 编辑器保存和字数统计方法 ====================
    
    // 初始化字数统计
    initWordCount() {
        const editor = document.getElementById('tiptapEditor');
        if (!editor) {
            console.error('编辑器元素未找到');
            return;
        }
        
        // 监听编辑器内容变化
        editor.addEventListener('input', () => {
            this.updateWordCount();
        });
        
        editor.addEventListener('paste', () => {
            setTimeout(() => this.updateWordCount(), 100);
        });
        
        // 初始更新字数
        this.updateWordCount();
    }
    
    // 更新字数统计
    updateWordCount() {
        const editor = document.getElementById('tiptapEditor');
        const wordCountElement = document.getElementById('wordCount');
        
        if (!editor || !wordCountElement) {
            return;
        }
        
        // 获取编辑器内容
        let content = '';
        if (editor.isContentEditable) {
            content = editor.textContent || editor.innerText || '';
        } else {
            content = editor.value || '';
        }
        
        // 计算字数（中文字符和英文单词）
        const chineseChars = content.match(/[\u4e00-\u9fa5]/g) || [];
        const englishWords = content.match(/\b[a-zA-Z]+\b/g) || [];
        const totalWords = chineseChars.length + englishWords.length;
        
        // 更新显示
        wordCountElement.textContent = totalWords;
        
        // 保存当前内容
        this.editorContent = content;
    }
    
    // 保存编辑器内容
    async saveEditorContent() {
        if (this.isSaving) {
            console.log('正在保存中，请稍候...');
            return;
        }
        
        const editor = document.getElementById('tiptapEditor');
        if (!editor) {
            console.error('编辑器元素未找到');
            return;
        }
        
        // 获取编辑器内容
        let content = '';
        if (editor.isContentEditable) {
            content = editor.textContent || editor.innerText || '';
        } else {
            content = editor.value || '';
        }
        
        if (!content.trim()) {
            this.showModal('保存失败', '<p>编辑器内容为空，无法保存。</p>');
            return;
        }
        
        // 检查内容是否与上次保存的内容相同
        if (content === this.lastSavedContent) {
            this.updateStatusMessage('内容未更改，无需保存');
            return;
        }
        
        this.isSaving = true;
        this.updateSaveStatus('saving');
        
        try {
            // 获取当前时间
            const now = new Date();
            const timestamp = now.toLocaleString('zh-CN');
            
            // 构建保存的数据
            const saveData = {
                title: `小说文档_${now.getTime()}`,
                type: '小说数据',
                content: content,
                parent_id: 2,
                description: `保存于 ${timestamp}`
            };
            
            console.log('正在保存编辑器内容...');
            
            // 调用后端API保存内容
            const response = await fetch(`${this.serverUrl}/api/context/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(saveData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('保存成功:', result);
            
            // 更新保存状态
            this.lastSavedContent = content;
            this.updateSaveStatus('saved');
            this.updateLastSavedTime(timestamp);
            
            // 显示成功消息
            this.updateStatusMessage(`内容已保存到上下文: ${result.context_id || '未知'}`);
            
            // 刷新上下文列表
            await this.refreshContexts();
            
        } catch (error) {
            console.error('保存失败:', error);
            this.updateSaveStatus('error');
            this.showModal('保存失败', `<p>错误信息: ${error.message}</p>`);
        } finally {
            this.isSaving = false;
        }
    }
    
    // 更新保存状态
    updateSaveStatus(status) {
        const saveStatusElement = document.getElementById('saveStatus');
        if (!saveStatusElement) return;
        
        // 移除所有状态类
        saveStatusElement.classList.remove('saving', 'saved', 'error', 'ready');
        
        // 添加当前状态类
        saveStatusElement.classList.add(status);
        
        // 更新图标和文本
        const icon = saveStatusElement.querySelector('i');
        const text = saveStatusElement.querySelector('span');
        
        if (icon && text) {
            switch (status) {
                case 'saving':
                    icon.className = 'fas fa-spinner fa-spin';
                    text.textContent = '保存中...';
                    break;
                case 'saved':
                    icon.className = 'fas fa-check-circle';
                    text.textContent = '已保存';
                    break;
                case 'error':
                    icon.className = 'fas fa-exclamation-circle';
                    text.textContent = '保存失败';
                    break;
                case 'ready':
                    icon.className = 'fas fa-circle';
                    text.textContent = '就绪';
                    break;
            }
        }
    }
    
    // 更新最后保存时间
    updateLastSavedTime(timeString) {
        const lastSavedElement = document.getElementById('lastSaved');
        if (lastSavedElement) {
            lastSavedElement.textContent = timeString;
        }
    }
    
    // 插入文本到编辑器顶部（用于AI响应）
    insertTextToEditorTop(text) {
        const editor = document.getElementById('tiptapEditor');
        if (!editor) {
            console.error('编辑器元素未找到');
            return;
        }
        
        // 确保文本以换行符结尾
        const formattedText = text.trim() + '\n\n';
        
        // 这里需要根据实际的编辑器实现来插入文本到顶部
        // 由于我们不知道editor.js的具体实现，这里提供一个通用方法
        if (editor.isContentEditable) {
            // 对于contenteditable元素，插入到开头
            const range = document.createRange();
            const selection = window.getSelection();
            
            // 选择编辑器的开头
            range.setStart(editor, 0);
            range.collapse(true);
            
            // 移除所有现有选择
            selection.removeAllRanges();
            selection.addRange(range);
            
            // 插入文本
            if (document.execCommand && document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, formattedText);
            } else {
                // 创建文本节点并插入
                const textNode = document.createTextNode(formattedText);
                range.insertNode(textNode);
                
                // 将光标移动到插入的文本后面
                range.setStartAfter(textNode);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } else {
            // 如果不是contenteditable，尝试直接在前面添加
            editor.value = formattedText + (editor.value || '');
        }
        
        // 更新字数统计
        this.updateWordCount();
    }

    
    // 显示流式结果模态框 - 改进版
    showStreamingResultModal(nodeName, nodeType, parentId, relatedContextCount) {
        console.log("📊 显示流式结果模态框:", { nodeName, nodeType, parentId, relatedContextCount });
        const modalContent = `
            <div class="streaming-result-modal">  
                    <div class="streaming-result-timeline">
                        <div class="timeline-content" id="streamingMessages">
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.showModal('<i class="fas fa-stream"></i> 创建节点进度', modalContent);
        
        // 初始化流式消息容器
        this.streamingMessagesContainer = document.getElementById('streamingMessages');
        if (this.streamingMessagesContainer) {
            this.streamingMessagesContainer.innerHTML = '';
        }
        
        // 存储当前流式请求的控制器，用于取消
        this.currentStreamingController = null;
        

    }
    
    // 发送流式创建请求
    async sendStreamingCreateRequest(nodeData, nodeName, parentId, relatedContextCount) {
        console.log("📤 发送流式创建请求:", nodeData);
        
        try {
            // 创建AbortController用于取消请求
            const controller = new AbortController();
            this.currentStreamingController = controller;
            
            // 发送流式请求
            const response = await fetch(`${this.serverUrl}/api/context/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nodeData),
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedContent = '';
            
            // 添加初始消息
            this.addStreamingMessage('info', '开始处理请求...');
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const eventData = JSON.parse(line);
                            this.handleStreamingEvent(eventData, nodeName, parentId, relatedContextCount);
                        } catch (error) {
                            console.error('解析流式数据失败:', error, '原始数据:', line);
                            this.addStreamingMessage('error', `解析数据失败: ${error.message}`);
                        }
                    }
                }
            }
            // 流式处理完成 - 不再在这里显示完成消息，由nodes_created事件处理
            // 延迟刷新上下文，确保后端已处理完成
            setTimeout(() => {
                this.refreshContexts();
            }, 1500);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('流式请求已被取消');
                this.addStreamingMessage('warning', '请求已被取消');
            } else {
                console.error('流式请求失败:', error);
                this.addStreamingMessage('error', `请求失败: ${error.message}`);
            }
        } finally {
            this.currentStreamingController = null;
        }
    }
    
    // 处理流式事件
    handleStreamingEvent(eventData, nodeName, parentId, relatedContextCount) {
        const { type, content, status, tool, input, output, data, nodes, count } = eventData;
        switch (type) {
            case 'ai_message':
                // AI 生成的文本内容
                this.addStreamingMessage('ai_message', `${content}`);
                break;
            case 'thought':
                // 大模型思考过程 - 根据status展示不同阶段
                if (status === 'thinking') {
                    this.addStreamingMessage('thought', `${content}`);
                } else if (status === 'tool_start') {
                    // 工具调用开始
                    const inputPreview = eventData.input_preview || (input ? JSON.stringify(input).substring(0, 200) : '');
                    let msg = `${content}`;
                    if (inputPreview) {
                        msg += `\n📋 参数: ${inputPreview}`;
                    }
                    this.addStreamingMessage('tool', msg);
                } else if (status === 'tool_end') {
                    // 工具调用结束
                    const outputPreview = eventData.output ? 
                        (typeof eventData.output === 'string' ? eventData.output.substring(0, 300) : JSON.stringify(eventData.output).substring(0, 300)) : '';
                    let msg = `${content}`;
                    if (outputPreview) {
                        msg += `\n📄 结果: ${outputPreview}${eventData.output && (eventData.output.length > 300 || JSON.stringify(eventData.output).length > 300) ? '...' : ''}`;
                    }
                    this.addStreamingMessage('tool', msg);
                } else if (status === 'complete') {
                    // 任务完成总结
                    this.addStreamingMessage('success', `${content}`);
                } else {
                    // 其他思考过程
                    this.addStreamingMessage('thought', `${content}`);
                }
                break;
            case 'tool':
                const toolTitle = status === 'start' ? `🛠️ 思考中: ${content}` : `✅ 执行结果: ${content}`;
                const toolInput = eventData.tool_input || input;
                const toolOutput = eventData.tool_output || output;
                const detail = toolInput ? `输入: ${JSON.stringify(toolInput)}` : (toolOutput ? `输出: ${JSON.stringify(toolOutput)}` : '');
                this.addStreamingMessage('tool', `${toolTitle}\n${detail}`);
                break;
            case 'stats':
                // Token 统计面板
                this.addStreamingMessage('stats', `📊 Token统计: ${JSON.stringify(data)}`);
                break;
            case 'nodes_created':
                // 节点创建完成事件
                const nodeCount = count || (nodes ? nodes.length : 1);
                const nodeList = nodes || [];
                let nodeInfo = `✅ 成功创建 ${nodeCount} 个节点：\n`;
                for (const node of nodeList) {
                    nodeInfo += `  • ${node.name} (${node.type}, ID: ${node.id})\n`;
                }
                this.addStreamingMessage('success', nodeInfo);
                break;
            case 'error':
                this.addStreamingMessage('error', `❌ 错误: ${content}`);
                break;
            default:
                // 未知事件类型，直接显示
                if (content) {
                    this.addStreamingMessage('info', `${content}`);
                }
                break;
        }
    }




    // 添加流式消息 - 改进版
    addStreamingMessage(type, content) {
        const container = this.streamingMessagesContainer;
        if (!container) return;
    
        const messageElement = document.createElement('div');
        messageElement.className = `timeline-item timeline-item-${type}`;
        
        let icon = 'fa-info-circle';
        let title = '系统消息';
    
        switch (type) {
            case 'tool':
                icon = 'fa-wrench';
                title = 'Agent 思考步骤';
                break;
            case 'ai_message':
                icon = 'fa-robot';
                title = 'AI 响应';
                break;
            case 'thought':
                icon = 'fa-brain';
                title = '思考过程';
                break;
            case 'stats':
                icon = 'fa-chart-bar';
                title = 'Token 统计';
                break;
            case 'success':
                icon = 'fa-check-circle';
                title = '节点创建结果';
                break;
            case 'error':
                icon = 'fa-exclamation-circle';
                title = '错误';
                break;
            case 'warning':
                icon = 'fa-exclamation-triangle';
                title = '警告';
                break;
            case 'info':
                icon = 'fa-info-circle';
                title = '系统消息';
                break;
        }
    
        messageElement.innerHTML = `
            <div class="timeline-item-icon"><i class="fas ${icon}"></i></div>
            <div class="timeline-item-content">
                <div class="timeline-item-header">${title}</div>
                <div class="timeline-item-body" style="white-space: pre-wrap;">${content}</div>
            </div>
        `;
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }
    
    // 格式化流式内容 - 提取关键信息
    formatStreamingContent(content, type) {
        if (!content) return '';
        
        // 如果是JSON字符串，尝试解析并提取关键信息
        if (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
            try {
                const parsed = JSON.parse(content);
                return this.extractKeyInfo(parsed, type);
            } catch (e) {
                // 如果不是有效的JSON，返回原内容
                return content;
            }
        }
        
        // 如果是对象，提取关键信息
        if (typeof content === 'object' && content !== null) {
            return this.extractKeyInfo(content, type);
        }
        
        // 普通字符串内容
        return content;
    }
    
    // 提取关键信息
    extractKeyInfo(data, type) {
        if (!data) return '';
        
        switch (type) {
            case 'content':
                // 内容类型：显示内容预览
                if (typeof data === 'string') {
                    return data.length > 150 ? data.substring(0, 150) + '...' : data;
                }
                if (data.content) {
                    const content = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
                    return content.length > 150 ? content.substring(0, 150) + '...' : content;
                }
                break;
                
            case 'tool':
                // 工具调用：显示工具名称和参数
                let toolInfo = `<strong>${data.tool || '未知工具'}</strong>`;
                if (data.parameters) {
                    toolInfo += `<br><small>参数: ${JSON.stringify(data.parameters).substring(0, 100)}...</small>`;
                }
                return toolInfo;
                
            case 'progress':
                // 进度信息：显示阶段和状态
                if (data.stage) {
                    return `<strong>${data.stage}</strong>${data.message ? ': ' + data.message : ''}`;
                }
                break;
                
            case 'all_nodes_saved':
                // 节点保存成功：显示节点数量
                const nodeCount = data.ids ? data.ids.length : 0;
                return `✅ 成功创建了 <strong>${nodeCount}</strong> 个节点`;
                
            default:
                // 其他类型：显示关键字段
                const keyFields = ['message', 'status', 'result', 'stage', 'tool', 'content'];
                for (const field of keyFields) {
                    if (data[field]) {
                        return typeof data[field] === 'string' ? data[field] : JSON.stringify(data[field]).substring(0, 200);
                    }
                }
        }
        
        // 如果没有匹配的格式，返回简化的JSON
        return JSON.stringify(data, null, 2).substring(0, 300) + (JSON.stringify(data).length > 300 ? '...' : '');
    }
    


    // 更新消息计数
    updateMessageCount() {
        if (!this.streamingMessagesContainer) return;
        
        const messageCount = this.streamingMessagesContainer.children.length;
        const messageCountElement = document.getElementById('messageCount');
        if (messageCountElement) {
            messageCountElement.textContent = messageCount;
        }
    }
    

    
    // 根据消息类型更新进度
    updateStreamingProgressBasedOnType(type, content) {
        let percentage = 0;
        let status = '处理中...';
        
        switch (type) {
            case 'progress':
                if (content && typeof content === 'object' && content.percentage) {
                    percentage = content.percentage;
                    status = content.message || '处理中...';
                } else {
                    // 根据消息数量估算进度
                    if (this.streamingMessagesContainer) {
                        const totalMessages = this.streamingMessagesContainer.children.length;
                        percentage = Math.min(90, totalMessages * 10);
                    }
                }
                break;
                
            case 'tool':
                percentage = 30;
                status = '调用工具中...';
                break;
                
            case 'content':
                percentage = 60;
                status = '生成内容中...';
                break;
                
            case 'all_nodes_saved':
                percentage = 100;
                status = '完成';
                break;
                
            case 'success':
                percentage = 100;
                status = '完成';
                break;
                
            case 'error':
                percentage = 100;
                status = '错误';
                break;
                
            default:
                // 根据消息数量估算进度
                if (this.streamingMessagesContainer) {
                    const totalMessages = this.streamingMessagesContainer.children.length;
                    percentage = Math.min(90, totalMessages * 10);
                }
        }
        

    }
    
    // 取消流式请求
    cancelStreamingRequest() {
        if (this.currentStreamingController) {
            this.currentStreamingController.abort();
            console.log('已取消流式请求');
        }
        this.hideModal();
    }
    
    // 调试树状结构
    debugTreeStructure(treeData, indent = 0) {
        if (!treeData || !Array.isArray(treeData)) {
            console.log(' '.repeat(indent) + '树状数据为空或无效');
            return;
        }
        
        console.log(' '.repeat(indent) + '📊 调试树状结构:');
        for (const node of treeData) {
            console.log(' '.repeat(indent) + `├─ ID: ${node.id}, 名称: ${node.name || '未命名'}, 类型: ${node.type || '未知'}, 父节点: ${node.parent_id || '无'}`);
            
            if (node.children && Array.isArray(node.children) && node.children.length > 0) {
                this.debugTreeStructure(node.children, indent + 4);
            }
        }
    }
    
    // 更新消息计数
    updateMessageCount() {
        const messageCountElement = document.getElementById('messageCount');
        if (messageCountElement) {
            messageCountElement.textContent = this.messages.length;
        }
    }
    
    // 检查服务器是否运行
    get isServerRunning() {
        // 这里可以添加更复杂的服务器健康检查逻辑
        // 目前简单返回true，假设服务器总是运行
        return true;
    }
}




// 全局实例
let novelGenerator;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    novelGenerator = new NovelGenerator();
    // 确保全局可访问
    window.novelGenerator = novelGenerator;
});
