import os
import json
from typing import Dict, List, Any, Optional
from pathlib import Path

class ContextManager:
    def __init__(self, context_dir: str = "context_data"):
        self.context_dir = Path(context_dir)
        self.context_dir.mkdir(exist_ok=True)
        # 默认上下文类型定义（可扩展）
        self.context_types = {
            "novel_info": "小说简介",
            "chat_history": "对话历史",
            "character_setting": "人物设定",
            "world_setting": "世界观设定",
            "plot_outline": "剧情大纲",
            "writing_style": "写作风格"
        }
        self.active_contexts: List[str] = ["chat_history"]  # 默认激活的上下文

    def save_context(self, context_type: str, content: Any, append: bool = False) -> bool:
        """保存指定类型的上下文（支持追加模式）"""
        if context_type not in self.context_types:
            print(f"⚠️ 无效的上下文类型: {context_type}")
            return False
            
        file_path = self.context_dir / f"{context_type}.json"
        
        # 追加模式处理（主要用于对话历史）
        if append and file_path.exists():
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
                if isinstance(existing, list) and isinstance(content, list):
                    existing.extend(content)
                    content = existing
            except Exception as e:
                print(f"⚠️ 追加模式加载失败: {e}")
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(content, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"❌ 保存上下文失败 ({context_type}): {e}")
            return False

    def load_context(self, context_type: str) -> Optional[Any]:
        """加载指定类型的上下文"""
        file_path = self.context_dir / f"{context_type}.json"
        if not file_path.exists():
            return None
            
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ 加载上下文失败 ({context_type}): {e}")
            return None

    def list_available_contexts(self) -> Dict[str, bool]:
        """返回所有可用上下文及其激活状态"""
        result = {}
        for ctx_type, desc in self.context_types.items():
            exists = (self.context_dir / f"{ctx_type}.json").exists()
            is_active = ctx_type in self.active_contexts
            result[ctx_type] = {
                "description": desc,
                "exists": exists,
                "active": is_active
            }
        return result

    def toggle_context(self, context_type: str, activate: bool) -> bool:
        """激活/停用指定上下文"""
        if context_type not in self.context_types:
            return False
        
        if activate and context_type not in self.active_contexts:
            # 检查上下文是否存在（除chat_history外）
            if context_type != "chat_history" and not (self.context_dir / f"{context_type}.json").exists():
                print(f"⚠️ 上下文 '{self.context_types[context_type]}' 不存在，无法激活")
                return False
            self.active_contexts.append(context_type)
            return True
        elif not activate and context_type in self.active_contexts:
            self.active_contexts.remove(context_type)
            return True
        return False

    def get_active_contexts_content(self) -> str:
        """获取所有激活上下文的拼接内容（供LLM使用）"""
        parts = []
        for ctx_type in self.active_contexts:
            content = self.load_context(ctx_type)
            if content is None:
                continue
                
            # 格式化不同上下文
            if ctx_type == "chat_history" and isinstance(content, list):
                history_str = "\n".join([
                    f"[用户]: {turn['user']}\n[AI]: {turn['ai']}" 
                    for turn in content[-10:]  # 限制最近10轮
                ])
                if history_str:
                    parts.append(f"## 对话历史 ##\n{history_str}")
            elif isinstance(content, dict):
                content_str = "\n".join([f"{k}: {v}" for k, v in content.items() if v])
                if content_str:
                    parts.append(f"## {self.context_types[ctx_type]} ##\n{content_str}")
            elif isinstance(content, str) and content.strip():
                parts.append(f"## {self.context_types[ctx_type]} ##\n{content.strip()}")
        
        return "\n\n".join(parts) if parts else "无可用上下文"

    # 保留原有方法保持兼容性（内部调用新方法）
    def save_novel_info(self, info: Dict):
        self.save_context("novel_info", info)
    
    def load_novel_info(self) -> Optional[Dict]:
        return self.load_context("novel_info")
    
    def save_chat_history(self, history: List[Dict]):
        self.save_context("chat_history", history)
    
    def load_chat_history(self) -> Optional[List[Dict]]:
        return self.load_context("chat_history") or []
