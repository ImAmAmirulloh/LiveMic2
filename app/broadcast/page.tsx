'use client';

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Users, Copy, Check } from 'lucide-react';
import Link from 'next/link';

export default function BroadcastPage() {
  const [roomId, setRoomId] = useState(() => {
    if (typeof window !== 'undefined') {
      return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    return '';
  });
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [listenersCount, setListenersCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const connectedListenersRef = useRef<Set<string>>(new Set());

  const createPeerConnection = async (listenerId: string, stream: MediaStream, socket: Socket) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    peerConnectionsRef.current.set(listenerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('candidate', listenerId, event.candidate);
      }
    };

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('offer', listenerId, pc.localDescription);
  };

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      socket.emit('join-as-broadcaster', roomId);
    });

    socket.on('listener-joined', async (listenerId: string) => {
      console.log('Listener joined:', listenerId);
      
      // Close existing connection if any
      const existingPc = peerConnectionsRef.current.get(listenerId);
      if (existingPc) {
        existingPc.close();
        peerConnectionsRef.current.delete(listenerId);
      }

      connectedListenersRef.current.add(listenerId);
      setListenersCount(connectedListenersRef.current.size);
      
      if (localStreamRef.current) {
        await createPeerConnection(listenerId, localStreamRef.current, socket);
      }
    });

    socket.on('answer', async (id: string, description: RTCSessionDescriptionInit) => {
      const pc = peerConnectionsRef.current.get(id);
      if (pc) {
        await pc.setRemoteDescription(description);
      }
    });

    socket.on('candidate', async (id: string, candidate: RTCIceCandidateInit) => {
      const pc = peerConnectionsRef.current.get(id);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('peer-disconnected', (id: string) => {
      const pc = peerConnectionsRef.current.get(id);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(id);
      }
      connectedListenersRef.current.delete(id);
      setListenersCount(connectedListenersRef.current.size);
    });

    return () => {
      socket.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      const pcs = peerConnectionsRef.current;
      pcs.forEach(pc => pc.close());
    };
  }, [roomId]);

  const startBroadcast = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      
      // Send offer to all currently connected listeners
      if (socketRef.current) {
        for (const listenerId of connectedListenersRef.current) {
          await createPeerConnection(listenerId, stream, socketRef.current);
        }
      }
      
      setIsBroadcasting(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Gagal mengakses mikrofon. Pastikan Anda memberikan izin.');
    }
  };

  const stopBroadcast = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    setIsBroadcasting(false);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center p-4 pt-12">
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
            &larr; Kembali
          </Link>
          <div className="flex items-center gap-2 text-zinc-400">
            <Users className="w-5 h-5" />
            <span className="font-medium">{listenersCount} Pendengar</span>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8 text-center space-y-8 border border-zinc-800">
          <div className="space-y-2">
            <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Kode Ruangan</h2>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl font-bold tracking-widest text-blue-500">{roomId}</span>
              <button 
                onClick={copyRoomId}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                title="Salin Kode"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-zinc-500 text-sm pt-2">Bagikan kode ini kepada pendengar</p>
          </div>

          <div className="pt-4">
            <button
              onClick={isBroadcasting ? stopBroadcast : startBroadcast}
              className={`relative group flex flex-col items-center justify-center w-48 h-48 mx-auto rounded-full transition-all duration-300 ${
                isBroadcasting 
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-2 border-red-500/50' 
                  : 'bg-blue-500 text-white hover:bg-blue-600 shadow-[0_0_40px_rgba(59,130,246,0.3)] hover:shadow-[0_0_60px_rgba(59,130,246,0.5)]'
              }`}
            >
              {isBroadcasting && (
                <div className="absolute inset-0 rounded-full border-4 border-red-500/30 animate-ping" />
              )}
              {isBroadcasting ? (
                <>
                  <MicOff className="w-12 h-12 mb-2" />
                  <span className="font-semibold">Hentikan Siaran</span>
                </>
              ) : (
                <>
                  <Mic className="w-12 h-12 mb-2" />
                  <span className="font-semibold text-lg">Mulai Siaran</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
