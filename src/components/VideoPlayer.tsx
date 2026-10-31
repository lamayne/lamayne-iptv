import { useEffect, useMemo } from 'react';
import { Tv } from 'lucide-react';
import type { Channel } from '@/types';
import { useApp } from '@/context/AppContext';
import MpvPlayer from '@/components/MpvPlayer';



type Props = {
  channel: Channel;
};



export default function VideoPlayer({ channel }: Props) {
  const {
    importedChannels,
    setSelectedChannel,
    addToRecentlyWatched,
    t,
  } = useApp();



  const playableChannels = useMemo(
    () =>
      importedChannels.filter(
        (item) => item.isLive && Boolean(item.streamUrl)
      ),
    [importedChannels]
  );



  const channelList = useMemo(() => {
    const currentCategory = channel.category?.trim() ?? '';



    const categoryChannels = currentCategory
      ? playableChannels.filter(
          (item) =>
            item.category?.trim() === currentCategory
        )
      : playableChannels;



    const list = categoryChannels.some(
      (item) => item.id === channel.id
    )
      ? categoryChannels
      : playableChannels;


return [...list];

    }, [playableChannels, channel.id, channel.category]);



  const currentIndex = channelList.findIndex(
    (item) => item.id === channel.id
  );



  const canChangeChannel =
    currentIndex >= 0 && channelList.length > 1;



  useEffect(() => {
    if (channel.streamUrl) {
      addToRecentlyWatched(channel);
    }
  }, [channel, addToRecentlyWatched]);



  function changeChannel(direction: -1 | 1) {
    if (!canChangeChannel) return;



    const nextIndex =
      (currentIndex + direction + channelList.length) %
      channelList.length;



    setSelectedChannel(channelList[nextIndex]);
  }



  if (!channel.streamUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-surface-800 px-6 text-center text-sm text-zinc-400">
        <Tv className="mr-3 h-6 w-6 shrink-0" />
        {t('player.noStreamUrlForChannel')}
      </div>
    );
  }



  return (
    <div className="relative h-[calc(100vh-260px)] min-h-[240px] w-full rounded-2xl bg-transparent">
      <MpvPlayer
        url={channel.streamUrl}
        title={channel.name}
        isLive
        onPreviousChannel={
          canChangeChannel ? () => changeChannel(-1) : undefined
        }
        onNextChannel={
          canChangeChannel ? () => changeChannel(1) : undefined
        }
      />
    </div>
  );
}