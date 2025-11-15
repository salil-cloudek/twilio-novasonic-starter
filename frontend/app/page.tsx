'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import AudioCapture from '@/components/audio-capture';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, Mic, MicOff, Power, PowerOff } from 'lucide-react';
import { AudioPlaybackService } from '@/components/audio-playback';

interface TextMessage {
  text: string;
  role: string;
}

// Get WebSocket URL from environment or default to backend
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';

export default function Home() {
  const [status, setStatus] = useState('Disconnected');
  const [recording, setRecording] = useState(false);
  const [textOutputs, setTextOutputs] = useState<TextMessage[]>([]);
  const [wsKey, setWsKey] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const displayedMessages = useRef<Set<string>>(new Set());
  const displayedTextContentIds = useRef<Set<string>>(new Set());
  const contentIdToStage = useRef<Record<string, string>>({});
  const pendingTexts = useRef<Record<string, TextMessage>>({});
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const playbackServiceRef = useRef<AudioPlaybackService | null>(null);

  const setRecordingWithDebug = useCallback((value: boolean) => {
    console.log(`[Recording State] Setting to ${value}`);
    setRecording(value);
  }, []);

  const connect = () => {
    if (wsRef.current) wsRef.current.close();
    wsRef.current = new WebSocket(WS_URL);
    setStatus('Connecting...');
    setWsKey(k => k + 1);
    
    wsRef.current.onopen = () => setStatus('Connected');
    wsRef.current.onclose = () => {
      setStatus('Disconnected');
      setRecordingWithDebug(false);
    };
    wsRef.current.onerror = () => setStatus('Error');
    wsRef.current.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          console.log('[WS MESSAGE]', msg);
          
          if (msg.event) handleEventMessage(msg.event);
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      }
    };
  };

  const handleAudioError = useCallback((error: Error) => {
    console.error('[Audio Error]', error);
    setRecordingWithDebug(false);
  }, [setRecordingWithDebug]);

  const addMessage = useCallback((message: TextMessage) => {
    const messageKey = `${message.role}:${message.text}`;
    if (!displayedMessages.current.has(messageKey)) {
      console.log('[ADDING MESSAGE]', message);
      displayedMessages.current.add(messageKey);
      setTextOutputs(prev => [...prev, message]);
    } else {
      console.log('[SKIPPING DUPLICATE]', message);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEventMessage = (event: any) => {
    console.log('[WS EVENT]', event);
    
    if (event.contentStart && event.contentStart.type === 'TEXT') {
      const contentId = event.contentStart.contentId;
      let stage = 'FINAL';
      if (event.contentStart.additionalModelFields) {
        try {
          const fields = JSON.parse(event.contentStart.additionalModelFields);
          if (fields.generationStage) stage = fields.generationStage;
        } catch (e) {
          console.error('[TEXT STAGE ERROR]', e);
        }
      }
      if (contentId) {
        console.log('[TEXT STAGE]', contentId, stage);
        contentIdToStage.current[contentId] = stage;
      }
    } else if (event.textOutput) {
      const text = event.textOutput.content;
      const contentId = event.textOutput.contentId || 'default';
      const role = 'ASSISTANT';
      
      // Only show FINAL stage text
      const stage = contentIdToStage.current[contentId] || 'FINAL';
      if (stage === 'FINAL' && !displayedTextContentIds.current.has(contentId)) {
        const hasAudioOutput = event.audioOutput && event.audioOutput.contentId === contentId;
        
        if (!contentId || !hasAudioOutput) {
          console.log('[SHOWING ASSISTANT TEXT IMMEDIATELY]', { text, role });
          addMessage({ text, role });
          if (contentId) displayedTextContentIds.current.add(contentId);
        } else {
          console.log('[BUFFERING ASSISTANT TEXT]', { text, contentId });
          pendingTexts.current[contentId] = { text, role };
        }
      }
    } else if (event.audioOutput) {
      const base64Audio = event.audioOutput.content;
      const audioBytes = base64ToArrayBuffer(base64Audio);
      if (playbackServiceRef.current) {
        playbackServiceRef.current.playPCM(audioBytes);
      }
      
      const contentId = event.audioOutput.contentId || 'default';
      if (contentId && pendingTexts.current[contentId]) {
        const textMessage = pendingTexts.current[contentId];
        addMessage(textMessage);
        displayedTextContentIds.current.add(contentId);
        delete pendingTexts.current[contentId];
      }
    }
  };

  const disconnect = useCallback(() => {
    console.log('[Disconnect] Cleaning up connection');
    setRecordingWithDebug(false);
    setStatus('Disconnected');
    setTextOutputs([]);
    displayedMessages.current.clear();
    displayedTextContentIds.current.clear();
    contentIdToStage.current = {};
    pendingTexts.current = {};
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsKey(k => k + 1);
    }
    if (playbackServiceRef.current) {
      playbackServiceRef.current.stop();
    }
  }, [setRecordingWithDebug]);

  const startRecording = useCallback(() => {
    console.log('[Start Recording]');
    setRecordingWithDebug(true);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('start_audio');
    }
  }, [setRecordingWithDebug]);

  const stopRecording = useCallback(() => {
    console.log('[Stop Recording]');
    setRecordingWithDebug(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('stop_audio');
    }
  }, [setRecordingWithDebug]);

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  useEffect(() => {
    if (!playbackServiceRef.current) {
      playbackServiceRef.current = new AudioPlaybackService();
    }

    return () => {
      if (playbackServiceRef.current) {
        playbackServiceRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [textOutputs]);

  return (
    <main className="min-h-screen h-screen flex flex-col items-stretch bg-gray-100">
      <section className="w-full max-w-4xl mx-auto flex flex-col h-screen justify-between bg-white border-x border-gray-200">
        <Card className="flex-1 shadow-xl border-0 p-8 space-y-6 bg-white h-full flex flex-col">
          <div className="flex items-center justify-between mb-2 border-b pb-4 border-gray-100">
            <div className="flex items-center gap-2">
              <Button
                onClick={status === 'Connected' ? disconnect : connect}
                className={`bg-black text-white hover:bg-neutral-800 border-0 shadow-none rounded-full p-0 w-10 h-10 flex items-center justify-center`}
                size="icon"
                aria-label={status === 'Connected' ? 'Disconnect' : 'Connect'}
              >
                {status === 'Connected' ? <PowerOff size={20} /> : <Power size={20} />}
              </Button>
              <Button
                onClick={recording ? stopRecording : startRecording}
                disabled={status !== 'Connected'}
                className={`bg-black text-white hover:bg-neutral-800 border-0 shadow-none rounded-full p-0 w-10 h-10 flex items-center justify-center ${status !== 'Connected' ? 'opacity-50' : ''}`}
                size="icon"
                aria-label={recording ? 'Stop Recording' : 'Start Recording'}
              >
                {recording ? <MicOff size={20} /> : <Mic size={20} />}
              </Button>
              {recording && (
                <div className="ml-2 w-32">
                  <AudioCapture
                    key={wsKey}
                    websocket={wsRef.current}
                    isCapturing={recording}
                    onError={handleAudioError}
                    inline
                    setIsThinking={setIsThinking}
                  />
                </div>
              )}
            </div>
            <span className="ml-2 flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2" title={status}></span>
              <span className="text-sm text-gray-600">{status}</span>
            </span>
          </div>

          <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-4 bg-white p-0">
            {textOutputs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-center">
                <div>
                  <p className="mb-2">Start a conversation</p>
                  <p className="text-sm">Click Power to connect, then Mic to speak</p>
                </div>
              </div>
            ) : (
              textOutputs.map((msg, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 ${
                    msg.role === 'USER' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'ASSISTANT' && (
                    <Avatar className="bg-black text-white w-10 h-10 ring-2 ring-offset-2 ring-black/5">
                      <AvatarFallback><Bot size={20} /></AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`p-3 rounded-2xl shadow-sm max-w-[70%] text-sm font-medium ${
                      msg.role === 'USER'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </main>
  );
}
