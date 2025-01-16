"use client";

import type { CoreMessage } from "ai";
import { motion } from "framer-motion";
import _ from "lodash";
import { BotOffIcon, MessageCircleMoreIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { ChatContainer } from "~/components/chat/chat-container";
import { ChatInterface } from "~/components/insights/chat-interface";
import { useProfile } from "~/hooks/use-profile";
import { emotionToMoment, getVideoEmotions } from "~/lib/videos";
import { api } from "~/trpc/react";

export const maxDuration = 30;

const MIN_MEETINGS = 10;

export default function InsightsPage() {
  const [selectedVideo, setSelectedVideo] = useQueryState(
    "video",
    parseAsString.withDefault("all").withOptions({ history: "push" }),
  );
  const [selectedTopic, setSelectedTopic] = useQueryState(
    "topic",
    parseAsString.withOptions({ history: "push" }),
  );
  const [shouldShowLockScreen, setShouldShowLockScreen] = useState(true);

  const { profile } = useProfile();
  const { data: user, isLoading: userLoading } = api.auth.getUser.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
    },
  );

  const { data: frameworks, isLoading: frameworksLoading } =
    api.coachingFrameworks.list.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  const {
    data,
    isFetching: videosLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.videos.list.useInfiniteQuery(
    {
      limit: 36,
      options: {
        tags:
          user?.is_admin && (!profile || user.id === profile.id)
            ? undefined
            : [profile?.nickname ?? user?.nickname ?? ""],
      },
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnWindowFocus: false,
    },
  );

  const filteredVideos =
    data?.pages.flatMap((page) =>
      user?.is_admin && (!profile || user.id === profile.id)
        ? page.videos
        : page.videos.filter((v) =>
            v.tags.includes(profile?.nickname ?? user?.nickname ?? ""),
          ),
    ) ?? [];

  const videosEnriched = filteredVideos.map((video) => {
    const moments = video.moments ?? [];
    const emotions = getVideoEmotions(video) ?? [];
    const emotionMoments = emotions
      .map((emotion) => video.vtt && emotionToMoment(emotion, video, video.vtt))
      .filter((m): m is Exclude<typeof m, "" | null | undefined> => !!m);
    const allMoments = [...moments, ...emotionMoments];
    return { video, moments, emotions, emotionMoments, allMoments };
  });

  const moments =
    selectedVideo === "all"
      ? videosEnriched.flatMap((v) => v.allMoments)
      : videosEnriched
          .filter((v) => v.video.videoId === selectedVideo)
          .flatMap((v) => v.allMoments);

  const filteredMoments = moments
    .filter((moment) => {
      if (selectedVideo === "all") return true;
      return moment.video_id === selectedVideo;
    })
    .filter((moment) => {
      if (!selectedTopic || selectedTopic === "Coach") return true;
      return moment.activity === selectedTopic;
    });

  const topics = _.sortBy(
    Array.from(new Set(filteredMoments.map((m) => m.activity))),
    (x) => x,
  );

  const userId = profile?.id ?? user?.id ?? "";
  const topic = selectedTopic ?? "";

  const { data: chat, isFetching: chatLoading } = api.chats.get.useQuery(
    {
      userId,
      topic,
    },
    {
      refetchOnWindowFocus: false,
    },
  );

  // Load more videos when scrolling near the bottom
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      _.debounce(() => {
        const scrolledToBottom =
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 1000;
        if (scrolledToBottom) {
          void fetchNextPage();
        }
      }, 100)();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (userLoading || frameworksLoading || chatLoading || !userId) {
    return (
      <div className="mt-20 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          <MessageCircleMoreIcon className="h-10 w-10 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground">Preparing chat...</p>
        </motion.div>
      </div>
    );
  }

  if (!videosLoading && !filteredVideos.length) {
    return (
      <ChatContainer
        progress={{
          completedMeetings: filteredVideos.length,
          requiredMeetings: MIN_MEETINGS,
        }}
      >
        <div className="mt-20 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-6 text-center"
          >
            <motion.div
              initial={{ rotate: -10 }}
              animate={{ rotate: [10, -10, 10, 0] }}
              transition={{
                duration: 1.5,
                times: [0.2, 0.4, 0.6, 1],
                ease: [0.4, 0, 0.2, 1],
              }}
            >
              <BotOffIcon className="h-16 w-16 text-muted-foreground" />
            </motion.div>
            <div className="max-w-sm space-y-2">
              <p className="font-semibold">No meetings found</p>
              <p className="text-sm text-muted-foreground">
                Sorry, we are unable to provide insights if we don&apos;t have
                any meetings to analyze.
              </p>
            </div>
          </motion.div>
        </div>
      </ChatContainer>
    );
  }

  return (
    <ChatContainer
      progress={{
        completedMeetings: filteredVideos.length,
        requiredMeetings: MIN_MEETINGS,
      }}
    >
      <ChatInterface
        frameworks={frameworks ?? []}
        userId={userId}
        selectedTopic={topic}
        topics={topics}
        relevantMoments={filteredMoments}
        relevantVideos={filteredVideos}
        initialMessages={
          (chat?.data?.messages as CoreMessage[] | undefined) ?? []
        }
        onTopicSelect={(topic) => void setSelectedTopic(topic)}
        onClick={() => setShouldShowLockScreen(true)}
        isLoading={hasNextPage}
        disabled={videosLoading && filteredVideos.length < MIN_MEETINGS}
      />
    </ChatContainer>
  );
}
