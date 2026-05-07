/**
 * 自定义音频播放器 — 显示时长和播放进度
 */
import { useState, useRef, useEffect } from 'react';
import { Box, HStack, Text, IconButton, Slider, SliderTrack, SliderFilledTrack, Icon } from '@chakra-ui/react';
import { PlayIcon, PauseIcon, SpeakerIcon } from './Icons';

export default function AudioPlayer({ src, duration: initialDuration, onDurationChange }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(initialDuration || 0);
  const [durationLoaded, setDurationLoaded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      const dur = Math.ceil(audio.duration) || 0;
      setTotalDuration(dur);
      setDurationLoaded(true);
      if (onDurationChange) onDurationChange(dur);
    };

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [onDurationChange]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (value) => {
    const audio = audioRef.current;
    if (!audio || !durationLoaded) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Box w="full">
      <audio ref={audioRef} src={src} preload="metadata" />
      <HStack spacing={2} w="full">
        <IconButton
          icon={<Icon as={playing ? PauseIcon : PlayIcon} boxSize={4} />}
          size="sm"
          variant="ghost"
          color="rgba(245,240,232,0.8)"
          onClick={togglePlay}
          aria-label={playing ? '暂停' : '播放'}
        />
        <Box flex={1} minW={0}>
          <Slider
            size="sm"
            value={currentTime}
            min={0}
            max={durationLoaded ? totalDuration : 100}
            onChange={handleSeek}
            isDisabled={!durationLoaded}
          >
            <SliderTrack bg="whiteAlpha.200" h="4px">
              <SliderFilledTrack bg="orange.400" />
            </SliderTrack>
          </Slider>
        </Box>
        <Text fontSize="xs" color="rgba(245,240,232,0.6)" flexShrink={0} minW="36px">
          {formatTime(currentTime)}/{formatTime(totalDuration)}
        </Text>
        <Icon as={SpeakerIcon} boxSize={4} color="rgba(245,240,232,0.5)" flexShrink={0} />
      </HStack>
    </Box>
  );
}
