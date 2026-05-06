import React, { useState, useEffect, useCallback } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  text: string;
  className?: string;
  buttonSize?: 'sm' | 'default' | 'lg';
  iconOnly?: boolean;
  resolveText?: () => Promise<string>;
}

export function AudioPlayer({ text, className, buttonSize = 'sm', iconOnly = false, resolveText }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isPreparing, setIsPreparing] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSupported(false);
      return;
    }
    const synth = window.speechSynthesis;
    const refreshVoices = () => setVoices(synth.getVoices());
    refreshVoices();
    synth.addEventListener?.('voiceschanged', refreshVoices);
    return () => synth.removeEventListener?.('voiceschanged', refreshVoices);
  }, []);

  const stopAudio = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const toggleAudio = async () => {
    if (!isSupported) return;

    if (isPlaying) {
      stopAudio();
    } else {
      stopAudio(); // ensure anything else playing stops first
      let toSpeak = text;
      if (resolveText) {
        try {
          setIsPreparing(true);
          const resolved = await resolveText();
          if (typeof resolved === 'string' && resolved.trim().length > 0) {
            toSpeak = resolved;
          }
        } catch (e) {
          console.error("Audio resolver error", e);
        } finally {
          setIsPreparing(false);
        }
      }
      const preferredVoice =
        voices.find((v) => /Google US English|Samantha|Daniel|Karen|Moira|Microsoft Aria/i.test(v.name)) ||
        voices.find((v) => /en-US|en-GB/i.test(v.lang)) ||
        voices[0];

      const utterance = new SpeechSynthesisUtterance(toSpeak);
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.lang = preferredVoice?.lang || 'en-US';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = (e) => {
        console.error("Speech synthesis error", e);
        setIsPlaying(false);
      };
      setIsPlaying(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <Button
      variant={isPlaying ? "destructive" : "outline"}
      size={buttonSize}
      onClick={toggleAudio}
      disabled={isPreparing}
      className={cn("gap-2 shadow-sm", iconOnly && "px-2", className)}
      title={isPreparing ? "Preparing audio..." : isPlaying ? "Stop Audio" : "Play text as Audio"}
      aria-label={isPreparing ? "Preparing audio..." : isPlaying ? "Stop Audio" : "Play text as Audio"}
    >
      {isPreparing ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {!iconOnly ? "Preparing..." : null}
        </>
      ) : isPlaying ? (
        <>
          <Square className="w-4 h-4 fill-current" />
          {!iconOnly ? "Stop" : null}
        </>
      ) : (
        <>
          <Volume2 className="w-4 h-4" />
          {!iconOnly ? "Listen" : null}
        </>
      )}
    </Button>
  );
}
