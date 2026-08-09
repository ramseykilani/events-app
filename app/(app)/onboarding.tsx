import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';

const ONBOARDING_KEY = 'onboarding_complete';

type Page = {
  title: string;
  lines: string[];
};

const pages: Page[] = [
  {
    title: 'One place for events',
    lines: [
      'Found something you want to go to? Add it here and share it with the right people — instead of texting them one by one.',
      'When your people share something, it shows up on your calendar too.',
    ],
  },
  {
    title: 'Add from a link or from scratch',
    lines: [
      'Paste an event link and the details fill in automatically. Or just type a title and pick a date.',
      'After saving, you choose who sees it — specific people, a whole circle, or any combination.',
    ],
  },
  {
    title: "You choose who's in",
    lines: [
      'Add up to 50 people from your contacts. These are the people you can share your events with.',
      'Group them into circles so sharing with the right crowd is one tap.',
    ],
  },
];

export function pageIndexFromOffset(offsetX: number, pageWidth: number, pageCount: number): number {
  if (pageWidth <= 0) return 0;
  return Math.max(0, Math.min(pageCount - 1, Math.round(offsetX / pageWidth)));
}

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const [pageWidth, setPageWidth] = useState(0);
  const pageWidthRef = useRef(0);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const theme = useTheme();

  // Fall back to window width until onLayout fires so first paint has real page widths.
  const resolvedWidth = pageWidth > 0 ? pageWidth : windowWidth;

  useEffect(() => {
    pageWidthRef.current = resolvedWidth;
    scrollRef.current?.scrollTo({
      x: currentPageRef.current * resolvedWidth,
      animated: false,
    });
  }, [resolvedWidth]);

  const goToPage = (index: number, animated = true) => {
    const next = Math.max(0, Math.min(index, pages.length - 1));
    currentPageRef.current = next;
    setCurrentPage(next);
    scrollRef.current?.scrollTo({
      x: next * pageWidthRef.current,
      // On web, button-driven jumps must be instant: scroll-snap fights an
      // interrupted smooth scroll and can snap back a page, which then
      // re-syncs page state backward and swallows rapid Next taps. Gesture
      // scrolling still animates via snap on every platform.
      animated: Platform.OS === 'web' ? false : animated,
    });
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(app)');
  };

  const handleNext = () => {
    if (currentPageRef.current < pages.length - 1) {
      goToPage(currentPageRef.current + 1);
    } else {
      handleFinish();
    }
  };

  const syncPageFromOffset = (offsetX: number) => {
    const width = pageWidthRef.current;
    if (width <= 0) return;
    const index = pageIndexFromOffset(offsetX, width, pages.length);
    if (index !== currentPageRef.current) {
      currentPageRef.current = index;
      setCurrentPage(index);
    }
  };

  const handlePagerLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width);
    if (width > 0 && width !== pageWidthRef.current) {
      pageWidthRef.current = width;
      setPageWidth(width);
      // Re-snap after measure so pages align to the real pager width (not window).
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          x: currentPageRef.current * width,
          animated: false,
        });
      });
    }
  };

  const isLastPage = currentPage === pages.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToInterval={resolvedWidth > 0 ? resolvedWidth : undefined}
        snapToAlignment="start"
        onLayout={handlePagerLayout}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          syncPageFromOffset(e.nativeEvent.contentOffset.x);
        }}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          syncPageFromOffset(e.nativeEvent.contentOffset.x);
        }}
        onScrollEndDrag={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          syncPageFromOffset(e.nativeEvent.contentOffset.x);
        }}
        scrollEventThrottle={16}
        style={styles.pager}
        testID="onboarding-pager"
      >
        {pages.map((page) => (
          <View
            key={page.title}
            style={[
              styles.page,
              {
                width: resolvedWidth,
                paddingTop: insets.top + 56,
                paddingBottom: 24,
              },
            ]}
          >
            <View style={styles.content}>
              <Text
                style={[
                  styles.title,
                  {
                    color: theme.textPrimary,
                    fontFamily: theme.titleFontFamily,
                    fontWeight: theme.titleFontWeight,
                  },
                ]}
                accessibilityRole="header"
              >
                {page.title}
              </Text>
              {page.lines.map((line, i) => (
                <Text key={i} style={[styles.body, { color: theme.textSecondary }]}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 20,
            borderTopColor: theme.borderLight,
          },
        ]}
      >
        <View style={styles.dots} accessibilityRole="adjustable">
          {pages.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: theme.border },
                i === currentPage && { backgroundColor: theme.textPrimary, width: 24 },
              ]}
              accessibilityLabel={`Page ${i + 1} of ${pages.length}`}
              accessibilityState={{ selected: i === currentPage }}
            />
          ))}
        </View>

        <View style={styles.buttons}>
          {!isLastPage ? (
            <TouchableOpacity
              onPress={handleFinish}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.skipHit}
            >
              <Text style={[styles.skip, { color: theme.textSecondary }]}>Skip</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.skipHit} />
          )}
          <TouchableOpacity
            style={[styles.nextButton, { backgroundColor: theme.primaryButtonBg }]}
            onPress={handleNext}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={isLastPage ? 'Get Started' : 'Next'}
          >
            <Text style={[styles.nextText, { color: theme.primaryButtonText }]}>
              {isLastPage ? 'Get Started' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    paddingHorizontal: 28,
    justifyContent: 'flex-start',
  },
  content: {
    gap: 16,
    maxWidth: 420,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 4,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    minHeight: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  skipHit: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
  },
  skip: {
    fontSize: 16,
  },
  nextButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
