import re, json
import requests
from bs4 import BeautifulSoup
from langchain.tools import tool
import sys
import os

# 添加当前目录到路径，以便导入自定义模块
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 尝试导入新的上下文管理器，如果失败则使用备用方案
try:
    from context_manager import advanced_context_manager, ContextType
    HAS_ADVANCED_CONTEXT = True
except ImportError:
    HAS_ADVANCED_CONTEXT = False
    print("[⚠️] 高级上下文管理器不可用，使用简单文件保存", file=sys.stderr)


class FanqieNovelParser:
    """精准解析番茄小说详情页（对抗字体反爬+付费标识）"""
    
    def parse_novel(self, url):
        """解析小说页面 - 返回结构化数据"""
        # 验证URL有效性
        if "fanqienovel.com/page/" not in url:
            return {"error": "⚠️ 无效链接，请提供番茄小说详情页URL"}
        # 安全请求（带浏览器头+超时）
        resp = requests.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cookie": "fqnovel_platform=web"
        }, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        # === 核心数据提取 ===
        data = {
            "title": self._clean_text(soup.select_one('div.info-name h1').text),
            "status": [self._clean_text(s.text) for s in soup.select('div.info-label span')],
            "word_count": soup.select_one('div.info-count-word .detail').text + "万字",
            "last_update": {
                "chapter": self._clean_text(soup.select_one('div.info-last .info-last-title').text),
                "time": soup.select_one('div.info-last .info-last-time').text
            },
            "summary": self._clean_text(soup.select_one('div.page-abstract-content p').text),
            "toc": self._parse_toc(soup)
        }
        # 验证关键字段
        if not data["title"] or not data["summary"]:
            return {"error": "⚠️ 页面结构变更，解析失败"}
        return data 

    
    def _clean_text(self, text):
        """清理特殊字符（对抗字体反爬）"""
        if not text: return ""
        # 移除非常规字符 + 处理Unicode控制符
        return re.sub(r'[\x00-\x1f\x7f-\x9f]|[\uf000-\uf8ff]', '', text).strip()
    
    def _parse_toc(self, soup):
        """解析目录（识别付费章节）"""
        chapters = []
        for item in soup.select('div.chapter-item'):
            title = self._clean_text(item.select_one('a.chapter-item-title').text)
            if not title: continue
            
            # 检测付费锁标识
            is_locked = bool(item.select_one('span.chapter-item-lock'))
            chapters.append({
                "title": title,
                "locked": is_locked,
                "url": "https://fanqienovel.com" + item.select_one('a').get('href', '')
            })
        return chapters[:10]


def save_novel_to_context(novel_data, context_id=None):
    """保存小说数据到上下文"""
    if HAS_ADVANCED_CONTEXT:
        try:
            # 如果提供了context_id，使用它
            if context_id:
                # 检查上下文是否存在
                context = advanced_context_manager.get_context(context_id)
                if context:
                    # 更新现有上下文
                    advanced_context_manager.update_context(context_id, novel_data)
                    return context_id
                else:
                    # 创建新的小说数据上下文
                    new_id = advanced_context_manager.create_context(
                        name=f"小说: {novel_data.get('title', '未知')}",
                        context_type=ContextType.NOVEL,
                        content=novel_data
                    )
                    return new_id
            else:
                # 自动创建或更新小说数据上下文
                novel_contexts = advanced_context_manager.get_contexts_by_type(ContextType.NOVEL)
                if novel_contexts:
                    # 更新第一个小说数据上下文
                    novel_ctx = novel_contexts[0]
                    advanced_context_manager.update_context(novel_ctx.id, novel_data)
                    return novel_ctx.id
                else:
                    # 创建新的小说数据上下文
                    new_id = advanced_context_manager.create_context(
                        name=f"小说: {novel_data.get('title', '未知')}",
                        context_type=ContextType.NOVEL,
                        content=novel_data
                    )
                    return new_id
        except Exception as e:
            print(f"[⚠️] 保存到高级上下文失败: {e}", file=sys.stderr)
            return None
    else:
        # 简单文件保存（向后兼容）
        try:
            from datetime import datetime
            import os
            
            # 确保目录存在
            os.makedirs("contexts", exist_ok=True)
            
            # 生成上下文ID
            if context_id:
                ctx_id = context_id
            else:
                # 使用标题生成ID
                title = novel_data.get('title', 'unknown')
                safe_id = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
                ctx_id = safe_id or "novel_default"
            
            # 保存到文件
            filename = f"contexts/novel_{ctx_id}.json"
            data = {
                "type": "novel",
                "id": ctx_id,
                "name": f"小说: {novel_data.get('title', '未知')}",
                "content": novel_data,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            return f"novel_{ctx_id}"
        except Exception as e:
            print(f"[⚠️] 简单文件保存失败: {e}", file=sys.stderr)
            return None


@tool
def novel_tool(url: str, context_id: str = "") -> str:
    """解析番茄小说链接。必须条件: URL包含'fanqienovel.com/page/'。返回JSON: {status, data}
    
    参数:
        url: 番茄小说详情页URL
        context_id: (可选) 指定上下文ID，用于保存到特定上下文
    """
    result = FanqieNovelParser().parse_novel(url=url)
    if "error" not in result:
        # 保存小说数据到上下文
        saved_context_id = save_novel_to_context(result, context_id)
        
        if saved_context_id:
            return json.dumps({
                "status": "success",
                "data": result,
                "context_id": saved_context_id,
                "message": f"小说数据已保存到上下文: {saved_context_id}"
            }, ensure_ascii=False)
        else:
            return json.dumps({
                "status": "success",
                "data": result,
                "message": "小说数据解析成功，但保存到上下文失败"
            }, ensure_ascii=False)
    else:
        return json.dumps({
            "status": "error",
            "data": {"message": result.get("error", "解析失败")}
        }, ensure_ascii=False)
