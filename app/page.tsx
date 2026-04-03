import Link from 'next/link';
import { Mic, Headphones, Radio } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center p-4 bg-zinc-900 rounded-full mb-4">
            <Radio className="w-12 h-12 text-blue-500" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Live Mic</h1>
          <p className="text-zinc-400 text-lg">
            Ubah handphone Anda menjadi mikrofon atau speaker digital.
          </p>
        </div>

        <div className="grid gap-4 pt-8">
          <Link 
            href="/broadcast"
            className="group relative flex items-center justify-between p-6 bg-zinc-900 hover:bg-zinc-800 rounded-2xl border border-zinc-800 hover:border-blue-500/50 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl group-hover:scale-110 transition-transform">
                <Mic className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h2 className="text-xl font-semibold">Mulai Siaran</h2>
                <p className="text-zinc-400 text-sm">Jadi pembicara (Gunakan HP sebagai Mic)</p>
              </div>
            </div>
          </Link>

          <Link 
            href="/listen"
            className="group relative flex items-center justify-between p-6 bg-zinc-900 hover:bg-zinc-800 rounded-2xl border border-zinc-800 hover:border-emerald-500/50 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl group-hover:scale-110 transition-transform">
                <Headphones className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h2 className="text-xl font-semibold">Dengarkan Siaran</h2>
                <p className="text-zinc-400 text-sm">Jadi pendengar (Gunakan HP sebagai Speaker)</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
