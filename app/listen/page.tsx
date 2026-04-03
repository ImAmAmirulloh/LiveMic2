'use client';

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Headphones, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ListenPage() {
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const socket = socketRef.current;
    const pc = pcRef.current;
    return () => {
      if (socket) socket.disconnect();
      if (pc) pc.close();
    };
  }, []);

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    
    setError('');
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      socket.emit('join-as-listener', roomId.toUpperCase());
      setIsJoined(true);
    });

    socket.on('broadcaster-joined', () => {
      console.log('Broadcaster joined the room');
      setIsConnected(false);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      // Re-announce presence so the new broadcaster knows we are here
      socket.emit('join-as-listener', roomId.toUpperCase());
    });

    socket.on('offer', async (id: string, description: RTCSessionDescriptionInit) => {
      console.log('Received offer from broadcaster');
      
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('candidate', id, event.candidate);
        }
      };

      pc.ontrack = (event) => {
        console.log('Received audio track');
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          // Autoplay policy might require user interaction, but since they clicked "Join", it might work.
          audioRef.current.play().catch(err => {
            console.error('Autoplay prevented:', err);
            setError('Klik tombol unmute untuk memutar suara.');
            setIsMuted(true);
          });
          setIsConnected(true);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setIsConnected(false);
        }
      };

      await pc.setRemoteDescription(description);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('answer', id, pc.localDescription);
    });

    socket.on('candidate', async (id: string, candidate: RTCIceCandidateInit) => {
      if (pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('peer-disconnected', () => {
      setIsConnected(false);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    });
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.play().catch(console.error);
      }
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const leaveRoom = () => {
    if (socketRef.current) socketRef.current.disconnect();
    if (pcRef.current) pcRef.current.close();
    if (audioRef.current) audioRef.current.srcObject = null;
    
    setIsJoined(false);
    setIsConnected(false);
    setRoomId('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center p-4 pt-12">
      <audio ref={audioRef} autoPlay playsInline />
      
      <div className="max-w-md w-full space-y-8">
        <div className="flex items-center justify-between">
          <Link 
            href="/" 
            onClick={(e) => {
              if (isJoined) {
                e.preventDefault();
                leaveRoom();
              }
            }}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            &larr; Kembali
          </Link>
        </div>

        {!isJoined ? (
          <div className="bg-zinc-900 rounded-3xl p-8 space-y-6 border border-zinc-800">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl mb-2">
                <Headphones className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold">Gabung Siaran</h2>
              <p className="text-zinc-400 text-sm">Masukkan kode ruangan dari pembicara</p>
            </div>

            <form onSubmit={joinRoom} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="KODE RUANGAN"
                  maxLength={6}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-center text-2xl font-bold tracking-widest text-white placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all uppercase"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={roomId.length < 3}
                className="w-full bg-emerald-500 text-white font-semibold rounded-xl py-4 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Mulai Mendengarkan
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-zinc-900 rounded-3xl p-8 text-center space-y-8 border border-zinc-800">
            <div className="space-y-2">
              <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Ruangan</h2>
              <div className="text-3xl font-bold tracking-widest text-emerald-500">{roomId}</div>
            </div>

            <div className="py-8">
              <div className={`relative mx-auto w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${
                isConnected ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {isConnected && !isMuted && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping" />
                    <div className="absolute inset-[-20px] rounded-full border border-emerald-500/10 animate-ping" style={{ animationDelay: '0.5s' }} />
                  </>
                )}
                <Headphones className={`w-12 h-12 ${isConnected && !isMuted ? 'animate-pulse' : ''}`} />
              </div>
              
              <div className="mt-6 space-y-1">
                <h3 className="text-lg font-medium">
                  {isConnected ? 'Terhubung' : 'Menunggu Pembicara...'}
                </h3>
                <p className="text-zinc-400 text-sm">
                  {isConnected ? 'Menerima audio secara langsung' : 'Siaran belum dimulai atau terputus'}
                </p>
              </div>
            </div>

            {isConnected && (
              <button
                onClick={toggleMute}
                className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl font-medium transition-colors ${
                  isMuted 
                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                    : 'bg-zinc-800 text-white hover:bg-zinc-700'
                }`}
              >
                {isMuted ? (
                  <>
                    <VolumeX className="w-5 h-5" />
                    <span>Suara Dibisukan</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-5 h-5" />
                    <span>Bisukan Suara</span>
                  </>
                )}
              </button>
            )}

            {error && (
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm text-left">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
