"""
高级上下文管理器
支持多种上下文类型、多选、文件存储
"""
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional, Set, Any
from enum import Enum
import uuid


class ContextType(Enum):
    """上下文类型枚举"""
    CHARACTER = "人物设定"
    WORLD = "世界设定"
    OUTLINE = "作品大纲"
    EVENTS = "事件细纲"
    HISTORY = "会话历史"
    NOVEL = "小说数据"
    CUSTOM = "自定义"


class ContextItem:
    """上下文项（支持树状结构）"""
    
    def __init__(self, 
                 context_id: str,
                 name: str,
                 context_type: ContextType,
                 content: Any,
                 project_id: Optional[str] = None,
                 metadata: Optional[Dict] = None,
                 parent_id: Optional[str] = None,
                 children: Optional[List[str]] = None):
        self.id = context_id
        self.name = name
        self.type = context_type
        self.project_id = project_id or "default"
        self.metadata = metadata or {}
        self.parent_id = parent_id  # 父节点ID
        self.children = children or []  # 子节点ID列表
        self.created_at = datetime.now().isoformat()
        self.updated_at = self.created_at
        self.selected_items: Set[str] = set()  # 选中的条目ID
        
        # 处理content，支持字符串和列表两种格式
        if isinstance(content, list):
            # 列表格式：每个条目应该有id和content字段
            self.content = content
        else:
            # 字符串格式：转换为单一条目列表以保持兼容性
            self.content = [{
                "id": "item_1",
                "content": str(content),
                "created_at": self.created_at,
                "updated_at": self.updated_at
            }]
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type.value,
            "content": self.content,
            "project_id": self.project_id,
            "metadata": self.metadata,
            "parent_id": self.parent_id,
            "children": self.children,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "selected_items": list(self.selected_items)
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'ContextItem':
        """从字典创建"""
        # 处理旧格式数据：content可能是字符串或列表
        content = data["content"]
        
        # 处理parent_id和children字段（旧格式可能没有这些字段）
        parent_id = data.get("parent_id")
        children = data.get("children", [])
        
        item = cls(
            context_id=data["id"],
            name=data["name"],
            context_type=ContextType(data["type"]),
            content=content,
            project_id=data.get("project_id", "default"),
            metadata=data.get("metadata", {}),
            parent_id=parent_id,
            children=children
        )
        item.created_at = data.get("created_at", item.created_at)
        item.updated_at = data.get("updated_at", item.updated_at)
        item.selected_items = set(data.get("selected_items", []))
        return item
    
    def update(self, content: Any, metadata: Optional[Dict] = None):
        """更新内容"""
        if isinstance(content, list):
            self.content = content
        else:
            # 如果是字符串，更新第一个条目或创建新条目
            if self.content and len(self.content) > 0:
                self.content[0]["content"] = str(content)
                self.content[0]["updated_at"] = datetime.now().isoformat()
            else:
                self.content = [{
                    "id": "item_1",
                    "content": str(content),
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }]
        
        self.updated_at = datetime.now().isoformat()
        if metadata:
            self.metadata.update(metadata)
    
    def add_item(self, item_content: str, item_id: Optional[str] = None) -> str:
        """添加上下文条目"""
        if item_id is None:
            item_id = f"item_{len(self.content) + 1}"
        
        new_item = {
            "id": item_id,
            "content": item_content,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        self.content.append(new_item)
        self.updated_at = datetime.now().isoformat()
        return item_id
    
    def update_item(self, item_id: str, item_content: str) -> bool:
        """更新上下文条目"""
        for item in self.content:
            if item.get("id") == item_id:
                item["content"] = item_content
                item["updated_at"] = datetime.now().isoformat()
                self.updated_at = datetime.now().isoformat()
                return True
        return False
    
    def delete_item(self, item_id: str) -> bool:
        """删除上下文条目"""
        for i, item in enumerate(self.content):
            if item.get("id") == item_id:
                self.content.pop(i)
                # 从选中集中移除
                if item_id in self.selected_items:
                    self.selected_items.remove(item_id)
                self.updated_at = datetime.now().isoformat()
                return True
        return False
    
    def get_item(self, item_id: str) -> Optional[Dict]:
        """获取上下文条目"""
        for item in self.content:
            if item.get("id") == item_id:
                return item
        return None
    
    def list_items(self) -> List[Dict]:
        """列出所有条目"""
        return self.content
    
    def select_items(self, item_ids: List[str]):
        """选择条目"""
        for item_id in item_ids:
            if any(item.get("id") == item_id for item in self.content):
                self.selected_items.add(item_id)
    
    def deselect_items(self, item_ids: List[str]):
        """取消选择条目"""
        for item_id in item_ids:
            if item_id in self.selected_items:
                self.selected_items.remove(item_id)
    
    def clear_item_selection(self):
        """清空条目选择"""
        self.selected_items.clear()
    
    def get_selected_items_content(self) -> str:
        """获取选中条目的内容"""
        if not self.selected_items:
            # 如果没有选中任何条目，返回所有内容（向后兼容）
            return "\n".join([item.get("content", "") for item in self.content])
        
        selected_content = []
        for item in self.content:
            if item.get("id") in self.selected_items:
                selected_content.append(item.get("content", ""))
        
        return "\n".join(selected_content)
    
    def get_all_content(self) -> str:
        """获取所有内容（向后兼容）"""
        return "\n".join([item.get("content", "") for item in self.content])
    
    def add_child(self, child_id: str) -> bool:
        """添加子节点"""
        if child_id not in self.children:
            self.children.append(child_id)
            self.updated_at = datetime.now().isoformat()
            return True
        return False
    
    def remove_child(self, child_id: str) -> bool:
        """移除子节点"""
        if child_id in self.children:
            self.children.remove(child_id)
            self.updated_at = datetime.now().isoformat()
            return True
        return False
    
    def has_children(self) -> bool:
        """是否有子节点"""
        return len(self.children) > 0
    
    def get_tree_structure(self, depth: int = 0) -> str:
        """获取树状结构表示"""
        indent = "  " * depth
        result = f"{indent}├─ {self.name} ({self.type.value})\n"
        
        for item in self.content:
            if isinstance(item, dict) and item.get("content"):
                content_preview = item["content"][:50] + "..." if len(item["content"]) > 50 else item["content"]
                result += f"{indent}  │  - {content_preview}\n"
        
        return result


class AdvancedContextManager:
    """高级上下文管理器（支持树状结构）"""
    
    def __init__(self, data_dir: str = "context_data"):
        self.data_dir = data_dir
        self.contexts: Dict[str, ContextItem] = {}
        self.selected_contexts: Set[str] = set()  # 当前选中的上下文ID
        self.current_project = "default"
        
        # 创建数据目录
        os.makedirs(data_dir, exist_ok=True)
        
        # 加载现有数据
        self._load_all_contexts()
        
        # 重建树状结构关系
        self._rebuild_tree_structure()
    
    def _get_context_filepath(self, context_id: str) -> str:
        """获取上下文文件路径"""
        return os.path.join(self.data_dir, f"{context_id}.json")
    
    def _load_all_contexts(self):
        """加载所有上下文"""
        if not os.path.exists(self.data_dir):
            return
        
        for filename in os.listdir(self.data_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(self.data_dir, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        context_item = ContextItem.from_dict(data)
                        self.contexts[context_item.id] = context_item
                except Exception as e:
                    print(f"[⚠️] 加载上下文失败 {filename}: {e}", file=sys.stderr)
    
    def _save_context(self, context_item: ContextItem):
        """保存单个上下文"""
        try:
            filepath = self._get_context_filepath(context_item.id)
            temp_path = filepath + ".tmp"
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(context_item.to_dict(), f, ensure_ascii=False, indent=2)
            os.replace(temp_path, filepath)
        except Exception as e:
            print(f"[⚠️] 保存上下文失败 {context_item.id}: {e}", file=sys.stderr)
    
    def create_context(self, 
                      name: str,
                      context_type: ContextType,
                      content: Any,
                      project_id: Optional[str] = None,
                      metadata: Optional[Dict] = None,
                      parent_id: Optional[str] = None) -> str:
        """创建新上下文（支持树状结构）"""
        context_id = str(uuid.uuid4())[:8]  # 生成简短ID
        project_id = project_id or self.current_project
        
        context_item = ContextItem(
            context_id=context_id,
            name=name,
            context_type=context_type,
            content=content,
            project_id=project_id,
            metadata=metadata,
            parent_id=parent_id
        )
        
        self.contexts[context_id] = context_item
        self._save_context(context_item)
        
        # 如果指定了父节点，更新父节点的子节点列表
        if parent_id and parent_id in self.contexts:
            parent = self.contexts[parent_id]
            parent.add_child(context_id)
            self._save_context(parent)
        
        # 自动选中新创建的上下文
        self.selected_contexts.add(context_id)
        
        return context_id
    
    def update_context(self, context_id: str, content: Any, metadata: Optional[Dict] = None):
        """更新上下文内容"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        self.contexts[context_id].update(content, metadata)
        self._save_context(self.contexts[context_id])
    
    def delete_context(self, context_id: str) -> bool:
        """删除上下文"""
        if context_id not in self.contexts:
            return False
        
        # 从选中集中移除
        if context_id in self.selected_contexts:
            self.selected_contexts.remove(context_id)
        
        # 删除文件
        filepath = self._get_context_filepath(context_id)
        if os.path.exists(filepath):
            os.remove(filepath)
        
        # 从内存中移除
        del self.contexts[context_id]
        
        return True
    
    def get_context(self, context_id: str) -> Optional[ContextItem]:
        """获取单个上下文"""
        return self.contexts.get(context_id)
    
    def _rebuild_tree_structure(self):
        """重建树状结构关系"""
        # 清空所有子节点列表
        for context in self.contexts.values():
            context.children = []
        
        # 重新建立父子关系
        for context_id, context in self.contexts.items():
            if context.parent_id and context.parent_id in self.contexts:
                parent = self.contexts[context.parent_id]
                parent.add_child(context_id)
        
        # 保存更新后的树状结构
        for context in self.contexts.values():
            self._save_context(context)
    
    def list_contexts(self, 
                      project_id: Optional[str] = None,
                      context_type: Optional[ContextType] = None,
                      parent_id: Optional[str] = None) -> List[Dict]:
        """列出上下文（支持按父节点过滤）"""
        result = []
        project_id = project_id or self.current_project
        
        for context_id, item in self.contexts.items():
            if project_id and item.project_id != project_id:
                continue
            if context_type and item.type != context_type:
                continue
            if parent_id is not None:
                # 如果指定了parent_id，只返回该父节点的子节点
                if item.parent_id != parent_id:
                    continue
            elif parent_id == "":
                # 如果parent_id为空字符串，只返回根节点（没有父节点的节点）
                if item.parent_id is not None:
                    continue
            
            result.append({
                "id": context_id,
                "name": item.name,
                "type": item.type.value,
                "project_id": item.project_id,
                "parent_id": item.parent_id,
                "has_children": len(item.children) > 0,
                "is_selected": context_id in self.selected_contexts,
                "created_at": item.created_at,
                "updated_at": item.updated_at
            })
        
        return result
    
    def select_contexts(self, context_ids: List[str]):
        """选择多个上下文"""
        # 清空当前选择
        self.selected_contexts.clear()
        
        # 添加有效ID
        for context_id in context_ids:
            if context_id in self.contexts:
                self.selected_contexts.add(context_id)
            else:
                print(f"[⚠️] 上下文不存在，跳过: {context_id}", file=sys.stderr)
    
    def clear_selection(self):
        """清空选择"""
        self.selected_contexts.clear()
    
    def get_selected_contexts_content(self) -> str:
        """获取选中上下文的组合内容"""
        if not self.selected_contexts:
            return "【未选择任何上下文】"
        
        result = []
        for context_id in self.selected_contexts:
            item = self.contexts.get(context_id)
            if item:
                result.append(f"=== {item.type.value}: {item.name} ===\n{item.content}")
        
        return "\n\n".join(result)
    
    def get_contexts_by_type(self, context_type: ContextType) -> List[ContextItem]:
        """按类型获取上下文"""
        return [item for item in self.contexts.values() if item.type == context_type]
    
    def get_context_tree(self, root_id: Optional[str] = None) -> List[Dict]:
        """获取上下文树状结构"""
        result = []
        
        if root_id:
            # 从指定根节点开始
            if root_id in self.contexts:
                root = self.contexts[root_id]
                result.append(self._build_tree_node(root))
        else:
            # 获取所有根节点（没有父节点的节点）
            for context_id, context in self.contexts.items():
                if context.parent_id is None:
                    result.append(self._build_tree_node(context))
        
        return result
    
    def _build_tree_node(self, node: ContextItem) -> Dict:
        """构建树节点"""
        node_dict = {
            "id": node.id,
            "name": node.name,
            "type": node.type.value,
            "content": node.content,
            "project_id": node.project_id,
            "parent_id": node.parent_id,
            "has_children": len(node.children) > 0,
            "is_selected": node.id in self.selected_contexts,
            "created_at": node.created_at,
            "updated_at": node.updated_at,
            "children": []
        }
        
        # 递归构建子节点
        for child_id in node.children:
            if child_id in self.contexts:
                child = self.contexts[child_id]
                node_dict["children"].append(self._build_tree_node(child))
        
        return node_dict
    
    def move_context(self, context_id: str, new_parent_id: Optional[str] = None) -> bool:
        """移动上下文到新的父节点"""
        if context_id not in self.contexts:
            return False
        
        context = self.contexts[context_id]
        old_parent_id = context.parent_id
        
        # 检查是否形成循环引用
        if new_parent_id:
            # 不能将自己作为父节点
            if context_id == new_parent_id:
                return False
            
            # 检查新父节点是否是当前节点的子节点（避免循环）
            current_parent = new_parent_id
            while current_parent:
                if current_parent == context_id:
                    return False
                parent_context = self.contexts.get(current_parent)
                if not parent_context or not parent_context.parent_id:
                    break
                current_parent = parent_context.parent_id
        
        # 从旧父节点的子节点列表中移除
        if old_parent_id and old_parent_id in self.contexts:
            old_parent = self.contexts[old_parent_id]
            old_parent.remove_child(context_id)
            self._save_context(old_parent)
        
        # 更新当前节点的父节点
        context.parent_id = new_parent_id
        context.updated_at = datetime.now().isoformat()
        
        # 添加到新父节点的子节点列表
        if new_parent_id and new_parent_id in self.contexts:
            new_parent = self.contexts[new_parent_id]
            new_parent.add_child(context_id)
            self._save_context(new_parent)
        
        self._save_context(context)
        return True
    
    def get_context_path(self, context_id: str) -> List[Dict]:
        """获取上下文路径（从根节点到当前节点）"""
        path = []
        current_id = context_id
        
        while current_id and current_id in self.contexts:
            context = self.contexts[current_id]
            path.insert(0, {
                "id": context.id,
                "name": context.name,
                "type": context.type.value
            })
            current_id = context.parent_id
        
        return path
    
    def create_project(self, project_id: str, name: str):
        """创建项目（项目是上下文的容器）"""
        self.current_project = project_id
        project_file = os.path.join(self.data_dir, f"project_{project_id}.json")
        project_data = {
            "id": project_id,
            "name": name,
            "created_at": datetime.now().isoformat()
        }
        
        try:
            with open(project_file, 'w', encoding='utf-8') as f:
                json.dump(project_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[⚠️] 保存项目信息失败: {e}", file=sys.stderr)
    
    def save_to_context(self, 
                       context_id: str, 
                       content: Any,
                       append: bool = False,
                       metadata: Optional[Dict] = None,
                       as_new_item: bool = False):
        """保存内容到指定上下文"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        item = self.contexts[context_id]
        
        if as_new_item and isinstance(content, str):
            # 作为新条目添加
            self.add_context_item(context_id, content)
        elif append and isinstance(content, str):
            # 追加到现有内容（向后兼容）
            if len(item.content) > 0:
                # 追加到第一个条目
                current_content = item.content[0].get("content", "")
                new_content = f"{current_content}\n\n{content}"
                item.content[0]["content"] = new_content
                item.content[0]["updated_at"] = datetime.now().isoformat()
            else:
                # 创建新条目
                item.add_item(content)
            item.updated_at = datetime.now().isoformat()
        else:
            # 替换内容
            item.update(content, metadata)
        
        self._save_context(item)
    
    def save_to_history(self, 
                       question: str, 
                       answer: str,
                       project_id: Optional[str] = None):
        """保存对话历史到历史上下文"""
        project_id = project_id or self.current_project
        
        # 查找或创建历史上下文
        history_contexts = self.get_contexts_by_type(ContextType.HISTORY)
        history_context = None
        
        for ctx in history_contexts:
            if ctx.project_id == project_id:
                history_context = ctx
                break
        
        if not history_context:
            # 创建新的历史上下文
            history_id = self.create_context(
                name=f"{project_id}_对话历史",
                context_type=ContextType.HISTORY,
                content="",
                project_id=project_id,
                metadata={"is_history": True}
            )
            history_context = self.contexts[history_id]
        
        # 追加对话记录
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        history_entry = f"[{timestamp}] 用户: {question}\n[{timestamp}] AI: {answer}\n"
        
        current_content = history_context.content or ""
        new_content = f"{current_content}\n{history_entry}" if current_content else history_entry
        
        history_context.update(new_content)
        self._save_context(history_context)
    
    def get_context_items(self, context_id: str) -> List[Dict]:
        """获取上下文的所有条目"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        return self.contexts[context_id].list_items()
    
    def select_context_items(self, context_id: str, item_ids: List[str]):
        """选择上下文中的特定条目"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        self.contexts[context_id].select_items(item_ids)
        self._save_context(self.contexts[context_id])
    
    def deselect_context_items(self, context_id: str, item_ids: List[str]):
        """取消选择上下文中的条目"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        self.contexts[context_id].deselect_items(item_ids)
        self._save_context(self.contexts[context_id])
    
    def clear_context_item_selection(self, context_id: str):
        """清空上下文条目选择"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        self.contexts[context_id].clear_item_selection()
        self._save_context(self.contexts[context_id])
    
    def add_context_item(self, context_id: str, item_content: str, item_id: Optional[str] = None) -> str:
        """添加上下文条目"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        item_id = self.contexts[context_id].add_item(item_content, item_id)
        self._save_context(self.contexts[context_id])
        return item_id
    
    def update_context_item(self, context_id: str, item_id: str, item_content: str) -> bool:
        """更新上下文条目"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        success = self.contexts[context_id].update_item(item_id, item_content)
        if success:
            self._save_context(self.contexts[context_id])
        return success
    
    def delete_context_item(self, context_id: str, item_id: str) -> bool:
        """删除上下文条目"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        success = self.contexts[context_id].delete_item(item_id)
        if success:
            self._save_context(self.contexts[context_id])
        return success
    
    def get_context_item(self, context_id: str, item_id: str) -> Optional[Dict]:
        """获取上下文条目"""
        if context_id not in self.contexts:
            raise ValueError(f"上下文不存在: {context_id}")
        
        return self.contexts[context_id].get_item(item_id)
    
    def get_selected_contexts_content(self) -> str:
        """获取选中上下文的组合内容（支持条目级别选择）"""
        if not self.selected_contexts:
            return "【未选择任何上下文】"
        
        result = []
        for context_id in self.selected_contexts:
            item = self.contexts.get(context_id)
            if item:
                # 使用条目的选中内容获取方法
                content = item.get_selected_items_content()
                result.append(f"=== {item.type.value}: {item.name} ===\n{content}")
        
        return "\n\n".join(result)


# 全局实例
advanced_context_manager = AdvancedContextManager()
