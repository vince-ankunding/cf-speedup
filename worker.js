// ================== 全局配置变量 ==================

/**
 * 默认请求头
 * 模拟 iOS 17.5 上的 Safari 浏览器，以提高兼容性。
 * 客户端的请求头会覆盖这里的默认值（Host、cf-、x-forwarded- 等除外）。
 */
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

/**
 * 用于识别流媒体URL的正则表达式模式数组。
 * 如果URL与其中任何一个模式匹配，它将被视为流媒体请求。
 */
const STREAMING_URL_PATTERNS = [
  /rtmp[s]?:\/\//i, // RTMP/RTMPS 协议
  /\.flv$/i,         // FLV 文件
  /\.m3u8$/i,        // HLS 播放列表
  /\.ts$/i,          // HLS 视频分片
  /\.mp4$/i,         // MP4 文件
  /\.webm$/i,        // WebM 文件
  /hls/i,            // URL中包含 "hls"
  /dash/i,           // URL中包含 "dash"
  /stream/i,         // URL中包含 "stream"
  /live/i,           // URL中包含 "live"
  /broadcast/i       // URL中包含 "broadcast"
];

/**
 * 从客户端请求头中排除，不转发到目标服务器的请求头前缀或名称。
 */
const EXCLUDED_HEADERS = [
  'cf-',              // Cloudflare 特定头
  'x-forwarded-',     // 代理转发相关头
  'host'              // Host 头将由 fetch 根据目标URL自动生成
];

// ================== Worker 核心逻辑 ==================

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // 从路径中提取目标 URL
  let targetUrl = url.pathname.slice(1); // 使用 slice(1) 替代 replace("/", "") 更高效
  targetUrl = decodeURIComponent(targetUrl);

  // 如果没有目标URL，显示配置页面
  if (!targetUrl) {
    return getConfigPage(url.hostname);
  }

  // 检查是否为 RTMP/直播相关请求
  const isStreamingRequest = isStreamingUrl(targetUrl) || isStreamingMethod(request);

  try {
    // 构建请求头
    const proxyHeaders = buildProxyHeaders(request, isStreamingRequest);

    // 创建代理请求
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.body,
      redirect: 'manual'
    });

    // 发起请求
    const response = await fetch(proxyRequest);

    // 处理响应
    return handleResponse(response, url, targetUrl, isStreamingRequest);

  } catch (error) {
    console.error('代理请求失败:', error);
    return new Response(`代理错误: ${error.message}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }
}

/**
 * 检查URL是否符合流媒体特征
 * @param {string} url - 目标URL
 * @returns {boolean}
 */
function isStreamingUrl(url) {
  return STREAMING_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * 检查请求方法或内容类型是否与流媒体相关
 * @param {Request} request - 原始请求
 * @returns {boolean}
 */
function isStreamingMethod(request) {
  const contentType = request.headers.get('content-type') || '';
  return contentType.includes('video/') ||
    contentType.includes('application/x-rtmp') ||
    contentType.includes('application/vnd.apple.mpegurl');
}

/**
 * 构建转发到目标服务器的请求头
 * @param {Request} request - 原始请求
 * @param {boolean} isStreaming - 是否为流媒体请求
 * @returns {Headers}
 */
function buildProxyHeaders(request, isStreaming) {
  // 从默认配置开始
  const proxyHeaders = new Headers(DEFAULT_HEADERS);

  // 复制原始请求头，排除特定头，并允许客户端头覆盖默认值
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (!EXCLUDED_HEADERS.some(prefix => lowerKey.startsWith(prefix))) {
      proxyHeaders.set(key, value);
    }
  }

  // 为直播流优化的特定请求头
  if (isStreaming) {
    proxyHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    proxyHeaders.set('Pragma', 'no-cache');
    proxyHeaders.set('Connection', 'keep-alive');
  }

  return proxyHeaders;
}

/**
 * 处理从目标服务器返回的响应
 * @param {Response} response - 目标服务器的响应
 * @param {URL} originalUrl - 客户端请求Worker的URL对象
 * @param {string} targetUrl - 目标服务器的URL字符串
 * @param {boolean} isStreaming - 是否为流媒体请求
 * @returns {Response}
 */
async function handleResponse(response, originalUrl, targetUrl, isStreaming) {
  // 处理重定向
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (location) {
      const redirectUrl = new URL(location, targetUrl);
      const modifiedLocation = `https://${originalUrl.host}/${encodeURIComponent(redirectUrl.toString())}`;

      const redirectResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      redirectResponse.headers.set('Location', modifiedLocation);
      return addCorsHeaders(redirectResponse, isStreaming);
    }
  }

  // 处理流媒体响应
  if (isStreaming) {
    return handleStreamingResponse(response);
  }

  // 处理普通响应
  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });

  return addCorsHeaders(modifiedResponse, isStreaming);
}

/**
 * 专门处理流媒体响应，添加优化头
 * @param {Response} response - 原始响应
 * @returns {Response}
 */
async function handleStreamingResponse(response) {
  const responseHeaders = new Headers(response.headers);

  // 设置流媒体优化的响应头
  responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  responseHeaders.set('Pragma', 'no-cache');
  responseHeaders.set('Expires', '0');

  // 保持连接活跃
  responseHeaders.set('Connection', 'keep-alive');

  // 支持范围请求（对视频流重要）
  if (response.headers.has('accept-ranges')) {
    responseHeaders.set('Accept-Ranges', response.headers.get('accept-ranges'));
  } else {
    responseHeaders.set('Accept-Ranges', 'bytes');
  }

  const streamResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });

  return addCorsHeaders(streamResponse, true);
}

/**
 * 为响应添加通用的CORS头
 * @param {Response} response - 要修改的响应
 * @param {boolean} isStreaming - 是否为流媒体请求
 * @returns {Response}
 */
function addCorsHeaders(response, isStreaming) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  response.headers.set('Access-Control-Allow-Headers', '*');
  response.headers.set('Access-Control-Expose-Headers', '*');

  if (isStreaming) {
    // 流媒体特定的 CORS 设置
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  return response;
}

/**
 * 生成并返回配置页面的HTML
 * @param {string} hostname - 当前Worker的域名
 * @returns {Response}
 */
function getConfigPage(hostname) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>直播推流加速代理</title>
  <link rel="icon" type="image/jpg" href="https://cdn.jsdelivr.net/gh/png-dot/pngpng@main/20231112-014821-y4poc8.jpg">
  <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #333;
      }
      
      .container {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          width: 90%;
          max-width: 600px;
          animation: fadeIn 0.8s ease-out;
      }
      
      @keyframes fadeIn {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
      }
      
      h1 {
          text-align: center;
          margin-bottom: 30px;
          color: #2c3e50;
          font-size: 2.2em;
          font-weight: 600;
      }
      
      .subtitle {
          text-align: center;
          margin-bottom: 30px;
          color: #7f8c8d;
          font-size: 1.1em;
      }
      
      .form-group {
          margin-bottom: 25px;
      }
      
      label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #2c3e50;
      }
      
      input[type="text"] {
          width: 100%;
          padding: 15px;
          border: 2px solid #e0e6ed;
          border-radius: 12px;
          font-size: 16px;
          transition: all 0.3s ease;
          background: #f8f9fa;
      }
      
      input[type="text"]:focus {
          outline: none;
          border-color: #667eea;
          background: white;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
      }
      
      .btn {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          text-transform: uppercase;
          letter-spacing: 1px;
      }
      
      .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
      }
      
      .examples {
          margin-top: 30px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 12px;
          border-left: 4px solid #667eea;
      }
      
      .examples h3 {
          margin-bottom: 15px;
          color: #2c3e50;
      }
      
      .examples ul {
          list-style: none;
      }
      
      .examples li {
          margin: 8px 0;
          color: #7f8c8d;
          font-family: monospace;
          background: white;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #e0e6ed;
      }
      
      .footer {
          text-align: center;
          margin-top: 30px;
          color: #7f8c8d;
      }
      
      .footer a {
          color: #667eea;
          text-decoration: none;
      }
      
      @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
      }
      
      .shake {
          animation: shake 0.5s ease-in-out;
      }
      
      @media (max-width: 768px) {
          .container {
              margin: 20px;
              padding: 30px 20px;
          }
          
          h1 {
              font-size: 1.8em;
          }
      }
      
      @media (prefers-color-scheme: dark) {
          .container {
              background: rgba(30, 30, 30, 0.95);
              color: #e0e0e0;
          }
          
          h1, label {
              color: #f0f0f0;
          }
          
          .subtitle {
              color: #b0b0b0;
          }
          
          input[type="text"] {
              background: #2a2a2a;
              color: #e0e0e0;
              border-color: #444;
          }
          
          input[type="text"]:focus {
              background: #333;
              border-color: #667eea;
          }
          
          .examples {
              background: #2a2a2a;
              border-left-color: #667eea;
          }
          
          .examples li {
              background: #333;
              color: #e0e0e0;
              border-color: #555;
          }
      }
  </style>
</head>
<body>
  <div class="container">
      <h1>🚀 直播推流加速代理</h1>
      <p class="subtitle">为您的直播流提供全球加速服务</p>
      
      <div class="form-group">
          <label for="url">输入直播源地址:</label>
          <input type="text" id="url" placeholder="例如: https://your-stream-server.com/live/stream" />
          <button class="btn" onclick="createProxy()">生成加速地址</button>
      </div>
      
      <div class="examples">
          <h3>📝 使用示例:</h3>
          <ul>
              <li>RTMP推流: rtmp://live.example.com/live/streamkey</li>
              <li>HLS播放: https://cdn.example.com/live/stream.m3u8</li>
              <li>HTTP-FLV: https://live.example.com/live/stream.flv</li>
              <li>WebRTC: https://webrtc.example.com/room/123</li>
          </ul>
      </div>
      
      <div class="footer">
          <p>&copy; 2024 直播加速代理服务</p>
      </div>
  </div>
  
  <script>
      function createProxy() {
          const urlInput = document.getElementById('url');
          const inputUrl = urlInput.value.trim();
          
          if (!inputUrl) {
              urlInput.classList.add('shake');
              setTimeout(() => urlInput.classList.remove('shake'), 500);
              return;
          }
          
          const normalizedUrl = normalizeUrl(inputUrl);
          const proxyUrl = \`https://${hostname}/\${encodeURIComponent(normalizedUrl)}\`;
          
          // 创建结果显示
          showResult(proxyUrl, normalizedUrl);
          urlInput.value = '';
      }
      
      function normalizeUrl(url) {
          if (!url.match(/^https?:\\/\\//i) && !url.match(/^rtmp[s]?:\\/\\//i)) {
              return 'https://' + url;
          }
          return url;
      }
      
      function showResult(proxyUrl, originalUrl) {
          const resultHtml = \`
              <div style="margin-top: 20px; padding: 20px; background: #e8f5e8; border-radius: 12px; border: 1px solid #4caf50;">
                  <h3 style="color: #2e7d32; margin-bottom: 15px;">✅ 加速地址已生成</h3>
                  <p style="margin-bottom: 10px;"><strong>原始地址:</strong></p>
                  <div style="background: white; padding: 10px; border-radius: 6px; word-break: break-all; font-family: monospace; border: 1px solid #ddd;">\${originalUrl}</div>
                  <p style="margin: 15px 0 10px 0;"><strong>加速地址:</strong></p>
                  <div style="background: white; padding: 10px; border-radius: 6px; word-break: break-all; font-family: monospace; border: 1px solid #ddd;">\${proxyUrl}</div>
                  <button onclick="copyToClipboard('\${proxyUrl}')" style="margin-top: 15px; padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer;">复制加速地址</button>
              </div>
          \`;
          
          document.querySelector('.form-group').insertAdjacentHTML('afterend', resultHtml);
      }
      
      function copyToClipboard(text) {
          navigator.clipboard.writeText(text).then(() => {
              alert('加速地址已复制到剪贴板！');
          }).catch(() => {
              // 降级方案
              const textarea = document.createElement('textarea');
              textarea.value = text;
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              alert('加速地址已复制到剪贴板！');
          });
      }
      
      // 回车键支持
      document.getElementById('url').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
              createProxy();
          }
      });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
}
