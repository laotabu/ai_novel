"""
项目配置文件
集中管理所有配置项，便于维护和部署
"""

import os
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
import json

@dataclass
class ServerConfig:
    """服务器配置"""
    host: str = "localhost"
    port: int = 5000
    debug: bool = False
    cors_origins: list = field(default_factory=lambda: ["*"])
    
    @property
    def url(self) -> str:
        """获取服务器URL"""
        return f"http://{self.host}:{self.port}"

@dataclass
class DatabaseConfig:
    """数据库配置"""
    data_dir: str = "context_data"
    backup_dir: str = "backups"
    max_backup_files: int = 10
    
    def ensure_dirs(self) -> None:
        """确保目录存在"""
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)

@dataclass
class AIConfig:
    """AI配置"""
    model_name: str = "deepseek-chat"
    temperature: float = 0.7
    max_tokens: int = 2000
    timeout: int = 30
    api_key: Optional[str] = None
    
    @property
    def is_configured(self) -> bool:
        """检查AI配置是否完整"""
        return bool(self.api_key)

@dataclass
class ClientConfig:
    """客户端配置"""
    server_url: str = "http://localhost:5000"
    auto_connect: bool = True
    reconnect_attempts: int = 3
    reconnect_delay: int = 2

@dataclass
class LoggingConfig:
    """日志配置"""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file: Optional[str] = "logs/app.log"
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    backup_count: int = 5

@dataclass
class NovelGenerationConfig:
    """小说生成配置"""
    default_creativity: float = 0.7
    default_length: int = 1000
    max_length: int = 5000
    min_length: int = 100
    supported_styles: list = field(default_factory=lambda: [
        "奇幻", "科幻", "武侠", "言情", "悬疑", "历史", "现代"
    ])

class ConfigManager:
    """配置管理器"""
    
    def __init__(self, config_file: str = "config.json"):
        self.config_file = config_file
        self.server = ServerConfig()
        self.database = DatabaseConfig()
        self.ai = AIConfig()
        self.client = ClientConfig()
        self.logging = LoggingConfig()
        self.novel_generation = NovelGenerationConfig()
        
        # 从环境变量加载配置
        self._load_from_env()
        
        # 从配置文件加载（如果存在）
        self._load_from_file()
    
    def _load_from_env(self) -> None:
        """从环境变量加载配置"""
        # 服务器配置
        if os.getenv("SERVER_HOST"):
            self.server.host = os.getenv("SERVER_HOST")
        if os.getenv("SERVER_PORT"):
            self.server.port = int(os.getenv("SERVER_PORT"))
        if os.getenv("DEBUG"):
            self.server.debug = os.getenv("DEBUG").lower() == "true"
        
        # AI配置
        if os.getenv("AI_API_KEY"):
            self.ai.api_key = os.getenv("AI_API_KEY")
        if os.getenv("AI_MODEL"):
            self.ai.model_name = os.getenv("AI_MODEL")
        if os.getenv("AI_TEMPERATURE"):
            self.ai.temperature = float(os.getenv("AI_TEMPERATURE"))
        
        # 数据库配置
        if os.getenv("DATA_DIR"):
            self.database.data_dir = os.getenv("DATA_DIR")
        
        # 日志配置
        if os.getenv("LOG_LEVEL"):
            self.logging.level = os.getenv("LOG_LEVEL")
        if os.getenv("LOG_FILE"):
            self.logging.file = os.getenv("LOG_FILE")
    
    def _load_from_file(self) -> None:
        """从配置文件加载配置"""
        if not os.path.exists(self.config_file):
            return
        
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # 更新配置
            self._update_from_dict(data)
        except (json.JSONDecodeError, IOError) as e:
            print(f"警告：加载配置文件失败: {e}")
    
    def _update_from_dict(self, data: Dict[str, Any]) -> None:
        """从字典更新配置"""
        # 服务器配置
        if "server" in data:
            server_data = data["server"]
            self.server.host = server_data.get("host", self.server.host)
            self.server.port = server_data.get("port", self.server.port)
            self.server.debug = server_data.get("debug", self.server.debug)
            if "cors_origins" in server_data:
                self.server.cors_origins = server_data["cors_origins"]
        
        # AI配置
        if "ai" in data:
            ai_data = data["ai"]
            self.ai.model_name = ai_data.get("model_name", self.ai.model_name)
            self.ai.temperature = ai_data.get("temperature", self.ai.temperature)
            self.ai.max_tokens = ai_data.get("max_tokens", self.ai.max_tokens)
            self.ai.timeout = ai_data.get("timeout", self.ai.timeout)
            self.ai.api_key = ai_data.get("api_key", self.ai.api_key)
        
        # 数据库配置
        if "database" in data:
            db_data = data["database"]
            self.database.data_dir = db_data.get("data_dir", self.database.data_dir)
            self.database.backup_dir = db_data.get("backup_dir", self.database.backup_dir)
            self.database.max_backup_files = db_data.get("max_backup_files", self.database.max_backup_files)
        
        # 客户端配置
        if "client" in data:
            client_data = data["client"]
            self.client.server_url = client_data.get("server_url", self.client.server_url)
            self.client.auto_connect = client_data.get("auto_connect", self.client.auto_connect)
            self.client.reconnect_attempts = client_data.get("reconnect_attempts", self.client.reconnect_attempts)
            self.client.reconnect_delay = client_data.get("reconnect_delay", self.client.reconnect_delay)
        
        # 日志配置
        if "logging" in data:
            log_data = data["logging"]
            self.logging.level = log_data.get("level", self.logging.level)
            self.logging.format = log_data.get("format", self.logging.format)
            self.logging.file = log_data.get("file", self.logging.file)
            self.logging.max_file_size = log_data.get("max_file_size", self.logging.max_file_size)
            self.logging.backup_count = log_data.get("backup_count", self.logging.backup_count)
        
        # 小说生成配置
        if "novel_generation" in data:
            novel_data = data["novel_generation"]
            self.novel_generation.default_creativity = novel_data.get("default_creativity", self.novel_generation.default_creativity)
            self.novel_generation.default_length = novel_data.get("default_length", self.novel_generation.default_length)
            self.novel_generation.max_length = novel_data.get("max_length", self.novel_generation.max_length)
            self.novel_generation.min_length = novel_data.get("min_length", self.novel_generation.min_length)
            if "supported_styles" in novel_data:
                self.novel_generation.supported_styles = novel_data["supported_styles"]
    
    def save(self) -> None:
        """保存配置到文件"""
        config_dict = {
            "server": {
                "host": self.server.host,
                "port": self.server.port,
                "debug": self.server.debug,
                "cors_origins": self.server.cors_origins
            },
            "ai": {
                "model_name": self.ai.model_name,
                "temperature": self.ai.temperature,
                "max_tokens": self.ai.max_tokens,
                "timeout": self.ai.timeout,
                "api_key": self.ai.api_key if self.ai.api_key else None
            },
            "database": {
                "data_dir": self.database.data_dir,
                "backup_dir": self.database.backup_dir,
                "max_backup_files": self.database.max_backup_files
            },
            "client": {
                "server_url": self.client.server_url,
                "auto_connect": self.client.auto_connect,
                "reconnect_attempts": self.client.reconnect_attempts,
                "reconnect_delay": self.client.reconnect_delay
            },
            "logging": {
                "level": self.logging.level,
                "format": self.logging.format,
                "file": self.logging.file,
                "max_file_size": self.logging.max_file_size,
                "backup_count": self.logging.backup_count
            },
            "novel_generation": {
                "default_creativity": self.novel_generation.default_creativity,
                "default_length": self.novel_generation.default_length,
                "max_length": self.novel_generation.max_length,
                "min_length": self.novel_generation.min_length,
                "supported_styles": self.novel_generation.supported_styles
            }
        }
        
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config_dict, f, ensure_ascii=False, indent=2)
            print(f"配置已保存到 {self.config_file}")
        except IOError as e:
            print(f"保存配置失败: {e}")
    
    def validate(self) -> Dict[str, Any]:
        """验证配置"""
        errors = {}
        
        # 验证服务器端口
        if not (1 <= self.server.port <= 65535):
            errors["server.port"] = f"端口号必须在1-65535之间: {self.server.port}"
        
        # 验证AI配置
        if not self.ai.is_configured:
            errors["ai.api_key"] = "AI API密钥未配置"
        
        # 验证温度值
        if not (0.0 <= self.ai.temperature <= 2.0):
            errors["ai.temperature"] = f"温度值必须在0.0-2.0之间: {self.ai.temperature}"
        
        # 验证数据目录
        if not os.path.exists(self.database.data_dir):
            try:
                os.makedirs(self.database.data_dir, exist_ok=True)
            except OSError as e:
                errors["database.data_dir"] = f"无法创建数据目录: {e}"
        
        return errors
    
    def get_summary(self) -> Dict[str, Any]:
        """获取配置摘要（不包含敏感信息）"""
        return {
            "server": {
                "host": self.server.host,
                "port": self.server.port,
                "debug": self.server.debug,
                "url": self.server.url
            },
            "ai": {
                "model_name": self.ai.model_name,
                "temperature": self.ai.temperature,
                "max_tokens": self.ai.max_tokens,
                "is_configured": self.ai.is_configured
            },
            "database": {
                "data_dir": self.database.data_dir,
                "context_count": len(os.listdir(self.database.data_dir)) if os.path.exists(self.database.data_dir) else 0
            },
            "client": {
                "server_url": self.client.server_url,
                "auto_connect": self.client.auto_connect
            },
            "novel_generation": {
                "default_length": self.novel_generation.default_length,
                "supported_styles": self.novel_generation.supported_styles
            }
        }


# 全局配置实例
config = ConfigManager()

if __name__ == "__main__":
    # 测试配置
    print("配置摘要:")
    summary = config.get_summary()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    
    # 验证配置
    errors = config.validate()
    if errors:
        print("\n配置错误:")
        for key, error in errors.items():
            print(f"  {key}: {error}")
    else:
        print("\n配置验证通过")
