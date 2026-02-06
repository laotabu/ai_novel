import re
import json
import requests
from bs4 import BeautifulSoup
from langchain_core.tools import tool  # 严格使用 langchain_core

class FanqieNovelParser:
    """精准解析番茄小说详情页（对抗字体反爬+付费标识）"""
    
    def parse_novel(self, url: str) -> dict:
        """解析小说页面 - 返回纯净结构化数据（不修改任何外部状态）"""
        # 1. URL 验证（严格检查番茄小说格式）
        if not url.startswith("https://fanqienovel.com/page/"):
            return {
                "error": "无效链接",
                "message": "必须提供标准番茄小说详情页URL (https://fanqienovel.com/page/...)"
            }
        
        try:
            # 2. 安全请求（带浏览器头+超时）
            resp = requests.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Cookie": "fqnovel_platform=web; device_id=web_client",
                "Referer": "https://fanqienovel.com/"
            }, timeout=15)
            resp.raise_for_status()  # 抛出HTTP错误
        except requests.exceptions.RequestException as e:
            return {
                "error": "网络请求失败",
                "message": f"请求超时或被拒绝: {str(e)}"
            }
        
        # 3. HTML解析
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # 4. 关键字段验证（防止页面结构变更）
        title_elem = soup.select_one('div.info-name h1')
        summary_elem = soup.select_one('div.page-abstract-content p')
        if not title_elem or not summary_elem:
            return {
                "error": "页面结构变更",
                "message": "无法定位标题或简介元素，请检查URL是否有效"
            }
        
        # 5. 数据清洗与结构化
        return {
            "title": self._clean_text(title_elem.text),
            "author": self._clean_text(soup.select_one('div.info-author span').text) if soup.select_one('div.info-author span') else "未知作者",
            "status": [self._clean_text(s.text) for s in soup.select('div.info-label span')],
            "word_count": self._clean_text(soup.select_one('div.info-count-word .detail').text) + "万字" if soup.select_one('div.info-count-word .detail') else "0万字",
            "last_update": {
                "chapter": self._clean_text(soup.select_one('div.info-last .info-last-title').text) if soup.select_one('div.info-last .info-last-title') else "",
                "time": self._clean_text(soup.select_one('div.info-last .info-last-time').text) if soup.select_one('div.info-last .info-last-time') else ""
            },
            "summary": self._clean_text(summary_elem.text),
            "tags": [self._clean_text(tag.text) for tag in soup.select('div.info-tags span')],
            "toc": self._parse_toc(soup),
            "original_url": url  # 保留原始URL供溯源
        }

    def _clean_text(self, text: str) -> str:
        """深度清理特殊字符（对抗字体反爬）"""
        if not text:
            return ""
        # 移除控制字符 + Unicode私有区域 + 连续空白
        cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f\uf000-\uf8ff\ue000-\uf8ff]', '', text)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned
    
    def _parse_toc(self, soup) -> list:
        """解析目录（识别付费章节 + 标准化格式）"""
        chapters = []
        for idx, item in enumerate(soup.select('div.chapter-item'), 1):
            title_elem = item.select_one('a.chapter-item-title')
            if not title_elem:
                continue
            
            title = self._clean_text(title_elem.text)
            is_locked = bool(item.select_one('span.chapter-item-lock'))
            url = "https://fanqienovel.com" + title_elem.get('href', '')
            
            chapters.append({
                "index": idx,
                "title": title,
                "locked": is_locked,
                "url": url
            })
        return chapters[:20]  # 限制返回20章（避免token溢出）

@tool
def novel_tool(url: str) -> str:
    """
    番茄小说解析工具（严格遵循工具规范）
    调用条件: 用户明确提供包含 'fanqienovel.com/page/' 的URL
    返回: 标准JSON字符串 {status: "success"|"error", data: {...}|{message: "..."}}
    """
    parser = FanqieNovelParser()
    result = parser.parse_novel(url)
    
    # 标准化返回格式（Agent可直接处理）
    if "error" in result:
        return json.dumps({
            "status": "error",
            "message": f"【{result['error']}】{result.get('message', '解析失败')}"
        }, ensure_ascii=False)
    
    return json.dumps({
        "status": "success",
        "data": {
            "基本资料": {
                "书名": result["title"],
                "作者": result["author"],
                "状态": "/".join(result["status"]) if isinstance(result["status"], list) else result["status"],
                "字数": result["word_count"],
                "标签": "/".join(result["tags"]) if result.get("tags") else "无标签"
            },
            "最新动态": {
                "章节": result["last_update"]["chapter"],
                "更新时间": result["last_update"]["time"]
            },
            "内容简介": result["summary"],
            "目录预览": [
                f"{ch['index']}. {ch['title']} {'[付费]' if ch['locked'] else ''}" 
                for ch in result["toc"][:5]  # 仅展示前5章
            ],
            "原始链接": result["original_url"]
        }
    }, ensure_ascii=False)