# Nova Sonic Web Frontend

Web-based interface for conversing with Nova Sonic AI through a browser.

## Architecture

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development  
- **Tailwind CSS**: Utility-first styling
- **WebSocket**: Real-time bidirectional communication with backend
- **Web Audio API**: Audio capture (16kHz PCM) and playback (24kHz PCM)

## Features

- Real-time voice conversations with Nova Sonic
- Audio visualization during recording
- Chat message history
- WebSocket connection management
- Support for knowledge base tool use (backend integration)

## Setup

### Prerequisites

- Node.js 18+ 
- Backend server running (Twilio-Bedrock-Bridge on port 8080)

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Create `.env.local` (optional - defaults included):

```env
# WebSocket URL (defaults to ws://localhost:8080/ws)
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws

# Or production URL
# NEXT_PUBLIC_WS_URL=wss://your-alb-domain.com/ws
```

### Development

```bash
npm run dev
```

Open http://localhost:3000

### Production Build

```bash
npm run build
npm start
```

## Usage

1. **Connect**: Click the Power button to establish WebSocket connection
2. **Record**: Click the Mic button to start speaking
3. **Converse**: Speak naturally - Nova Sonic responds with audio and text
4. **Disconnect**: Click Power button to end session

## Components

### Audio System

- **AudioCapture** (`components/audio-capture.tsx`):
  - Captures microphone input at 16kHz
  - Converts to 16-bit PCM
  - Sends binary audio frames via WebSocket
  - Visual waveform display

- **AudioPlaybackService** (`components/audio-playback.tsx`):
  - Receives 24kHz PCM audio from Nova Sonic
  - Decodes base64-encoded audio chunks
  - Schedules smooth playback with Web Audio API
  - Manages audio buffer queue

### UI Components

- **page.tsx**: Main chat interface with:
  - Connection status indicator
  - Power/Mic control buttons
  - Message history display
  - Audio visualizer

- **Shadcn UI Components**:
  - Button, Card, Avatar from `components/ui/`
  - Styled with Tailwind CSS

## WebSocket Protocol

### Outgoing (Browser → Backend)

**Start Audio**:
```
"start_audio"
```

**Audio Chunks** (binary):
```
Int16Array buffer (16-bit PCM, 16kHz)
```

**Stop Audio**:
```
"stop_audio"
```

### Incoming (Backend → Browser)

**Events** (JSON):
```json
{
  "event": {
    "contentStart": { "type": "TEXT", "contentId": "..." },
    "textOutput": { "content": "...", "contentId": "..." },
    "audioOutput": { "content": "base64...", "contentId": "..." }
  }
}
```

## Integration with Backend

The frontend connects to the existing Twilio-Bedrock-Bridge backend which:
- Maintains bidirectional stream with Nova Sonic
- Handles knowledge base tool execution
- Converts audio formats (browser 16kHz ↔ Nova 24kHz)
- Manages conversation state

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support  
- Safari: ✅ Full support (requires user gesture for audio)
- Mobile browsers: ⚠️ Limited support (audio API constraints)

## Troubleshooting

### Connection Issues

- Verify backend is running on port 8080
- Check CORS configuration in backend
- Ensure WebSocket URL is correct

### Audio Issues

- Grant microphone permissions
- Use HTTPS in production (required for getUserMedia)
- Check browser console for Web Audio API errors

### Message Display Issues

- Check browser console for WebSocket message logs
- Verify event format matches backend protocol

## Development

Based on AWS sample: `aws-samples/sample-nova-sonic-agentic-chatbot`

Key adaptations:
- Simplified for single-purpose chat interface
- Direct binary audio transmission (no JSON wrapping)
- Integrated with existing backend WebSocket server
- Removed tool UI rendering (backend handles tool execution)

## Deployment

### Static Hosting (Recommended)

1. Build the application:
```bash
npm run build
```

2. Deploy to:
   - **AWS S3 + CloudFront**
   - **Vercel/Netlify** (auto-deploy from Git)
   - **AWS Amplify**

3. Configure environment variables in hosting platform

### Container Deployment

Use the included Dockerfile:
```bash
docker build -t nova-sonic-frontend .
docker run -p 3000:3000 nova-sonic-frontend
```

## License

MIT
