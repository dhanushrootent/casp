import React, { useState, useEffect, useCallback } from 'react';
import { Volume2, Square } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  text: string;
  className?: string;
  buttonSize?: 'sm' | 'default' | 'lg';
  iconOnly?: boolean;
}

export function AudioPlayer({ text, className, buttonSize = 'sm', iconOnly = false }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSupported(false);
    }
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

  const toggleAudio = () => {
    if (!isSupported) return;

    if (isPlaying) {
      stopAudio();
    } else {
      stopAudio(); // ensure anything else playing stops first
      const utterance = new SpeechSynthesisUtterance(text);
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
      className={cn("gap-2 shadow-sm", iconOnly && "px-2", className)}
      title={isPlaying ? "Stop Audio" : "Play text as Audio"}
      aria-label={isPlaying ? "Stop Audio" : "Play text as Audio"}
    >
      {isPlaying ? (
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
