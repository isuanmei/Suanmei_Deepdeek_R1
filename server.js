// 导入所需的模块
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config();

// 初始化应用
const app = express();

// 配置CORS和请求体解析
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 添加根路由处理
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 配置API密钥
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL;

// 初始化TextDecoder
const decoder = new TextDecoder();

// 处理聊天请求的路由
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        
        // 设置API请求选项
        if (!API_KEY || !API_URL) {
            console.error('环境变量未正确配置');
            console.error('API_KEY:', API_KEY ? '已设置' : '未设置');
            console.error('API_URL:', API_URL ? '已设置' : '未设置');
            return res.status(500).json({ error: '服务器配置错误：API配置缺失' });
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-r1-250120',
                messages: messages,
                stream: true,
                temperature: 0.6
            })
        });

        if (!response.ok) {
            console.error('API请求失败:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('错误详情:', errorText);
            return res.status(response.status).json({ 
                error: '与AI服务通信失败',
                details: errorText
            });
        }

        // 设置SSE响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 处理流式响应
        let buffer = '';
        response.body.on('data', chunk => {
            const text = decoder.decode(chunk);
            buffer += text;
            
            // 处理可能包含多个数据块的情况
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留最后一个可能不完整的行
            
            for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                    try {
                        // 确保数据格式正确
                        const data = JSON.parse(line.slice(5));
                        if (data.choices && data.choices[0].delta.content) {
                            res.write(`data: ${JSON.stringify(data)}\n\n`);
                        }
                    } catch (e) {
                        console.error('解析数据块失败:', e);
                    }
                }
            }
        });

        response.body.on('end', () => {
            res.end();
        });

        response.body.on('error', error => {
            console.error('Stream error:', error);
            res.end();
        });
    } catch (error) {
        console.error('Error:', error);
        console.error('API_KEY:', API_KEY ? '已设置' : '未设置');
        console.error('API_URL:', API_URL ? '已设置' : '未设置');
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});