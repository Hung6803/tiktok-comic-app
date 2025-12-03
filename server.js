const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;

// ===========================================
// STORY STORAGE - File-based JSON storage
// ===========================================
const DATA_DIR = path.join(__dirname, 'data');
const STORIES_FILE = path.join(DATA_DIR, 'stories.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Created data directory');
}

// Load stories from file
function loadStoriesFromFile() {
  try {
    if (fs.existsSync(STORIES_FILE)) {
      const data = fs.readFileSync(STORIES_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('❌ Error loading stories:', error);
    return [];
  }
}

// Save stories to file
function saveStoriesToFile(stories) {
  try {
    fs.writeFileSync(STORIES_FILE, JSON.stringify(stories, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('❌ Error saving stories:', error);
    return false;
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// DeepSeek API Proxy
app.post('/api/deepseek', async (req, res) => {
  const { apiKey, messages, temperature = 0.8, max_tokens = 4000 } = req.body;

  console.log('\n📖 DeepSeek request received');
  console.log('  Temperature:', temperature);
  console.log('  Max tokens:', max_tokens);
  console.log('  Messages count:', messages?.length);
  console.log('  System prompt length:', messages?.[0]?.content?.length || 0);
  console.log('  User prompt length:', messages?.[1]?.content?.length || 0);

  if (!apiKey) {
    console.error('❌ No API key provided');
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    console.log('🔄 Calling DeepSeek API...');

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 120000); // 120 seconds timeout

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature,
        max_tokens,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    // Check if response is ok before parsing
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseErr) {
        console.error('❌ Failed to parse error response:', parseErr);
        return res.status(response.status).json({
          error: `DeepSeek API error: ${response.statusText}`
        });
      }
      console.error('❌ DeepSeek API error:', errorData);
      return res.status(response.status).json({
        error: errorData.error?.message || 'DeepSeek API error'
      });
    }

    // Parse response body with error handling
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error('❌ Failed to parse DeepSeek response:', parseErr);
      console.error('   Response status:', response.status);
      console.error('   Response headers:', response.headers.raw());
      throw new Error('Invalid JSON response from DeepSeek API. Response may be truncated.');
    }

    console.log('✅ DeepSeek response received');
    console.log('  Response length:', data.choices?.[0]?.message?.content?.length || 0);
    console.log('  Tokens used:', data.usage?.total_tokens || 'N/A');
    console.log('  Finish reason:', data.choices?.[0]?.finish_reason || 'N/A');

    if (data.choices?.[0]?.finish_reason === 'length') {
      console.warn('⚠️  WARNING: Response was truncated due to max_tokens limit!');
    }

    res.json(data);
  } catch (error) {
    console.error('💥 DeepSeek error:', error);

    // Handle different error types
    if (error.name === 'AbortError') {
      console.error('❌ Request timeout (120s exceeded)');
      return res.status(504).json({
        error: 'Request timeout. DeepSeek API took too long to respond (>120s).'
      });
    }

    if (error.type === 'system' && error.code === 'ECONNRESET') {
      console.error('❌ Connection reset by DeepSeek API');
      return res.status(503).json({
        error: 'Connection lost with DeepSeek API. Please try again.'
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// Gemini 3 Pro Preview API - Text Generation (for story & prompts)
app.post('/api/gemini-text', async (req, res) => {
  const { apiKey, messages, temperature = 0.8, max_tokens = 8000 } = req.body;

  console.log('\n📖 Gemini 3 Pro Preview request received');
  console.log('  Temperature:', temperature);
  console.log('  Max tokens:', max_tokens);
  console.log('  Messages count:', messages?.length);

  if (!apiKey) {
    console.error('❌ No API key provided');
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    console.log('🔄 Calling Gemini 3 Pro API...');

    // Convert messages format to Gemini format
    const contents = messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role, // Gemini doesn't have system role
      parts: [{ text: msg.content }]
    }));

    // If first message was system, merge it with user message
    if (messages[0]?.role === 'system' && messages[1]?.role === 'user') {
      contents[0] = {
        role: 'user',
        parts: [{ text: `${messages[0].content}\n\n${messages[1].content}` }]
      };
      contents.splice(1, 1); // Remove the duplicate
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: contents,
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: max_tokens,
            topP: 0.95,
            topK: 40
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Gemini API error:', data);
      return res.status(response.status).json({
        error: data.error?.message || 'Gemini API error'
      });
    }

    // Extract text from response and format like DeepSeek
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('❌ No text found in Gemini response');
      return res.status(400).json({ error: 'No text generated' });
    }

    console.log('✅ Gemini response received');
    console.log('  Response length:', text.length);
    console.log('  Finish reason:', data.candidates?.[0]?.finishReason || 'N/A');

    // Format response to match DeepSeek structure
    res.json({
      choices: [{
        message: {
          content: text
        },
        finish_reason: data.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : 'length'
      }],
      usage: {
        total_tokens: data.usageMetadata?.totalTokenCount || 0
      }
    });

  } catch (error) {
    console.error('💥 Gemini error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gemini 2.0 Flash - Image Generation (with optional reference image)
app.post('/api/gemini', async (req, res) => {
  const { apiKey, prompt, referenceImage } = req.body;

  console.log('🎨 Gemini Image request received');
  console.log('  Prompt length:', prompt?.length || 0);
  console.log('  Reference image:', referenceImage ? 'Yes' : 'No');

  if (!apiKey) {
    console.error('❌ No API key provided');
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    console.log('🔄 Calling Gemini Image API...');

    // Build parts array - text prompt first, then reference image if provided
    const parts = [{ text: prompt }];

    // Add reference image if provided (for product ads)
    if (referenceImage) {
      // Extract base64 data and mime type from data URL
      const matches = referenceImage.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        console.log('  Adding reference image:', mimeType);
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        });
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: parts
          }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Gemini API error:', data);
      return res.status(response.status).json({
        error: data.error?.message || 'Gemini API error'
      });
    }

    // Extract image from response
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          console.log('✅ Gemini image generated successfully');
          console.log('  MIME type:', part.inlineData.mimeType);
          console.log('  Data length:', part.inlineData.data?.length || 0);
          return res.json({
            success: true,
            imageData: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          });
        }
      }
    }

    console.error('❌ No image found in Gemini response');
    console.error('Response structure:', JSON.stringify(data, null, 2));
    res.status(400).json({ error: 'No image generated' });
  } catch (error) {
    console.error('💥 Gemini error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// STORY STORAGE API ENDPOINTS
// ===========================================

// Get all stories
app.get('/api/stories', (req, res) => {
  console.log('📚 Loading all stories...');
  const stories = loadStoriesFromFile();
  console.log(`✅ Loaded ${stories.length} stories`);
  res.json({ success: true, stories });
});

// Get single story by ID
app.get('/api/stories/:id', (req, res) => {
  const { id } = req.params;
  console.log(`📖 Loading story: ${id}`);
  const stories = loadStoriesFromFile();
  const story = stories.find(s => s.id === id);

  if (!story) {
    return res.status(404).json({ error: 'Story not found' });
  }

  console.log(`✅ Found story: ${story.name}`);
  res.json({ success: true, story });
});

// Save/Update story
app.post('/api/stories', (req, res) => {
  const storyData = req.body;
  console.log(`💾 Saving story: ${storyData.name} (${storyData.id})`);

  if (!storyData.id) {
    return res.status(400).json({ error: 'Story ID is required' });
  }

  const stories = loadStoriesFromFile();
  const existingIndex = stories.findIndex(s => s.id === storyData.id);

  if (existingIndex >= 0) {
    stories[existingIndex] = storyData;
    console.log(`📝 Updated existing story`);
  } else {
    stories.unshift(storyData);
    console.log(`➕ Added new story`);
  }

  if (saveStoriesToFile(stories)) {
    console.log(`✅ Story saved successfully`);
    res.json({ success: true, message: 'Story saved' });
  } else {
    res.status(500).json({ error: 'Failed to save story' });
  }
});

// Delete story
app.delete('/api/stories/:id', (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ Deleting story: ${id}`);

  const stories = loadStoriesFromFile();
  const filteredStories = stories.filter(s => s.id !== id);

  if (filteredStories.length === stories.length) {
    return res.status(404).json({ error: 'Story not found' });
  }

  if (saveStoriesToFile(filteredStories)) {
    console.log(`✅ Story deleted successfully`);
    res.json({ success: true, message: 'Story deleted' });
  } else {
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📱 TikTok Comic Generator is ready!`);
});
