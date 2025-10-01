# 🚀 直播推流加速代理 Worker

<img width="856" height="847" alt="image" src="https://github.com/user-attachments/assets/8518b227-2373-4a9c-8061-1e338a2ffcac" />

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

一个基于 Cloudflare Workers 的高性能直播流代理服务，为 RTMP、HLS、HTTP-FLV 等各类直播协议提供全球加速能力。

## ✨ 核心特性

- 🌍 **全球加速** - 利用 Cloudflare 遍布全球的边缘节点，显著降低延迟
- 🎥 **多协议支持** - 支持 RTMP、HLS、HTTP-FLV、DASH、WebRTC 等主流直播协议
- 🔒 **CORS 完美处理** - 自动添加跨域头，解决浏览器播放限制
- 📱 **移动端优化** - 模拟 iOS Safari UA，提升兼容性
- ⚡ **智能识别** - 自动检测流媒体请求并应用优化策略
- 🎨 **美观界面** - 提供简洁易用的配置页面
- 🔄 **重定向处理** - 智能处理 301/302 等重定向响应
- 💾 **范围请求支持** - 支持视频 seek 操作

## 🚀 快速开始

### 部署到 Cloudflare Workers

   - 进入 Workers & Pages 页面
   - 点击「创建应用程序」
   - 选择「创建 Worker」
   - 给 Worker 命名（如 `tv-speedup`）
   - 将本项目的完整代码复制到编辑器中
   - 点击「保存并部署」
   - 部署成功后，绑定自定义域名，访问自定义域'https://domain.com'能成功打开
   - 例如使用cf代理'无线新闻台'，则在地址栏输入'https://domain.com/http://cdn6.veryfast.filegear-sg.me/live/wxxw/stream.m3u8'



## ⚙️ 配置说明

### 默认请求头

代码中配置了模拟 iOS 17.5 Safari 的请求头，可根据需要修改：

```javascript
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)...',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};
```

### 流媒体 URL 匹配规则

Worker 通过以下规则自动识别流媒体请求：

```javascript
const STREAMING_URL_PATTERNS = [
  /rtmp[s]?:\/\//i,  // RTMP/RTMPS 协议
  /\.flv$/i,         // FLV 文件
  /\.m3u8$/i,        // HLS 播放列表
  /\.ts$/i,          // HLS 视频分片
  /\.mp4$/i,         // MP4 文件
  /\.webm$/i,        // WebM 文件
  /hls/i,            // URL包含 hls
  /dash/i,           // URL包含 dash
  /stream/i,         // URL包含 stream
  /live/i,           // URL包含 live
  /broadcast/i       // URL包含 broadcast
];
```

可根据实际需求添加或修改匹配规则。

### 排除的请求头

以下请求头不会转发到目标服务器：

```javascript
const EXCLUDED_HEADERS = [
  'cf-',           // Cloudflare 特定头
  'x-forwarded-',  // 代理转发相关头
  'host'           // Host 头自动生成
];
```

## 🎯 核心功能

### 1. 智能流媒体识别

自动检测流媒体请求并应用专门的优化策略：
- 设置 `Cache-Control: no-cache` 防止缓存导致的播放问题
- 保持 `Connection: keep-alive` 确保流畅传输
- 支持 `Accept-Ranges: bytes` 实现视频拖拽功能

### 2. CORS 跨域支持

自动添加必要的 CORS 响应头：
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, HEAD
Access-Control-Allow-Headers: *
Access-Control-Expose-Headers: *
```

### 3. 重定向处理

智能处理 301、302、303、307、308 重定向，确保重定向后的 URL 也通过代理访问。

### 4. 请求头过滤

自动过滤 Cloudflare 和代理相关的请求头，避免目标服务器收到不必要的信息。

## 🔧 高级定制

### 修改默认 User-Agent

如果需要模拟其他设备或浏览器：

```javascript
const DEFAULT_HEADERS = {
  'User-Agent': 'Your-Custom-User-Agent',
  // ... 其他头部
};
```

### 添加自定义流媒体规则

在 `STREAMING_URL_PATTERNS` 数组中添加新的正则表达式：

```javascript
const STREAMING_URL_PATTERNS = [
  // ... 现有规则
  /\.mpd$/i,        // DASH manifest
  /\.ism$/i,        // Smooth Streaming
  /your-pattern/i   // 自定义规则
];
```

### 自定义配置页面

修改 `getConfigPage()` 函数中的 HTML，可以：
- 更改页面样式和布局
- 添加更多使用说明
- 自定义域名显示

## 📊 性能特点

- ⚡ **低延迟** - 利用 Cloudflare 全球 CDN 网络
- 🚀 **高并发** - Workers 平台支持大规模并发请求
- 💰 **免费额度** - Cloudflare Workers 提供每日 100,000 次免费请求
- 🔄 **自动扩展** - 无需管理服务器，自动应对流量变化

## ⚠️ 注意事项

1. **流量限制** - 免费版 Workers 有请求次数限制，超出需升级套餐
2. **CPU 时间** - 单个请求的 CPU 时间不能超过限制（免费版 10ms，付费版 50ms）
3. **合规使用** - 请确保遵守目标网站的服务条款和版权规定
4. **RTMP 限制** - 纯 RTMP 协议需要转换为 HTTP-FLV 或 HLS 才能通过 Worker 代理
5. **源站限制** - 某些网站可能有反爬虫或 IP 限制策略

## 🐛 故障排查

### 问题：无法播放视频

**解决方案：**
- 检查原始 URL 是否可以直接访问
- 确认 URL 编码正确
- 查看浏览器控制台的错误信息
- 确保目标服务器允许跨域访问

### 问题：播放卡顿

**解决方案：**
- 检查 Cloudflare 边缘节点与源站的距离
- 考虑使用 Workers KV 添加缓存层
- 升级到 Workers Unbound 获得更多 CPU 时间

### 问题：部分视频格式不支持

**解决方案：**
- 检查 `STREAMING_URL_PATTERNS` 是否包含该格式
- 添加相应的正则表达式匹配规则

## 📝 更新日志

### v1.0.0 (2024)
- ✨ 初始版本发布
- 🎥 支持主流直播协议
- 🎨 提供可视化配置界面
- 🔒 完善的 CORS 支持
- ⚡ 流媒体优化策略

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 🙏 致谢

- [Cloudflare Workers](https://workers.cloudflare.com/) - 提供强大的边缘计算平台
- 所有贡献者和用户的支持

---

**⚠️ 免责声明：** 本工具仅供学习和合法用途使用。使用者需自行承担使用本工具的所有责任，并遵守相关法律法规及目标网站的服务条款。
