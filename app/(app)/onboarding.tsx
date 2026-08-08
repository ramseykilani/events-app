import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';

const ONBOARDING_KEY = 'onboarding_complete';
const SWIPE_THRESHOLD = 48;

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
    title: 'You choose who\'s in',
    lines: [
      'Add up to 50 people from your contacts. These are the people you can share your events with.',
      'Group them into circles so sharing with the right crowd is one tap.',
    ],
  },
];

export default function OnboardingScreen() {
  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const goToPage = (index: number) => {
    const next = Math.max(0, Math.min(index, pages.length - 1));
    currentPageRef.current = next;
    setCurrentPage(next);
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

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _: GestureResponderEvent,
        gesture: PanResponderGestureState
      ) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (
        _: GestureResponderEvent,
        gesture: PanResponderGestureState
      ) => {
        const page = currentPageRef.current;
        if (gesture.dx <= -SWIPE_THRESHOLD && page < pages.length - 1) {
          goToPage(page + 1);
        } else if (gesture.dx >= SWIPE_THRESHOLD && page > 0) {
          goToPage(page - 1);
        }
      },
    })
  ).current;

  const page = pages[currentPage];
  const isLastPage = currentPage === pages.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.page} {...panResponder.panHandlers}>
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
          {page.lines.map((line: string, i: number) => (
            <Text key={i} style={[styles.body, { color: theme.textSecondary }]}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: 48 + insets.bottom }]}>
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
          {!isLastPage && (
            <TouchableOpacity
              onPress={handleFinish}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
            >
              <Text style={[styles.skip, { color: theme.textSecondary }]}>Skip</Text>
            </TouchableOpacity>
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
  page: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    gap: 16,
  },
  title: {
    fontSize: 28,
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    gap: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
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
  },
  skip: {
    fontSize: 16,
  },
  nextButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginLeft: 'auto',
    minHeight: 44,
    justifyContent: 'center',
  },
  nextText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
