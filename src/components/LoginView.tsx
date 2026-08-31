import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginViewProps {
  onLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage('Credenciales incorrectas en Supabase.');
    } else if (data.session) {
      onLogin();
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0c0e] flex items-center justify-center p-4 selection:bg-zinc-800 selection:text-zinc-100">
      <div className="w-full max-w-xs sm:max-w-sm bg-[#161619] border border-zinc-800/80 rounded-lg p-6 sm:p-7 shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-11 h-11 rounded-lg bg-[#1c1c20] border border-zinc-700/70 flex items-center justify-center font-bold text-sm font-mono text-zinc-100">
            CM
          </div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight font-sans">
            CelMart
          </h1>
          <p className="text-[11px] font-mono text-zinc-400">Acceso a Sistema de Taller</p>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs text-center font-mono">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
              <Mail className="w-3.5 h-3.5" />
            </div>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico..."
              className="w-full bg-[#1c1c20] text-zinc-100 text-xs pl-8 pr-3 py-2.5 rounded-md border border-zinc-700/60 focus:outline-none focus:border-zinc-400 placeholder-zinc-500 font-sans transition-colors"
            />
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña..."
              className="w-full bg-[#1c1c20] text-zinc-100 text-xs pl-8 pr-9 py-2.5 rounded-md border border-zinc-700/60 focus:outline-none focus:border-zinc-400 placeholder-zinc-500 font-mono transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium py-2 rounded-md transition-colors text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
            ) : (
              'Entrar al Sistema'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};