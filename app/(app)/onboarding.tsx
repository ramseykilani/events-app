import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

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
    title: 'You choose who\'s in',
    lines: [
      'Add up to 50 people from your contacts. These are the only people who can see your events or share theirs with you.',
      'Group them into circles so sharing with the right crowd is one tap.',
    ],
  },
];

export default function OnboardingScreen() {
  const flatListRef = useRef<FlatList>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentPage(index);
  };

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentPage + 1,
        animated: true,
      });
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(app)');
  };

  const isLastPage = currentPage === pages.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.page}>
            <View style={styles.content}>
              <Text style={styles.title}>{item.title}</Text>
              {item.lines.map((line, i) => (
                <Text key={i} style={styles.body}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentPage && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.buttons}>
          {!isLastPage && (
            <TouchableOpacity onPress={handleFinish}>
              <Text style={styles.skip}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextText}>
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
    backgroundColor: '#fff',
  },
  page: {
    width,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 48,
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
    backgroundColor: '#ddd',
  },
  dotActive: {
    backgroundColor: '#000',
    width: 24,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skip: {
    fontSize: 16,
    color: '#666',
  },
  nextButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginLeft: 'auto',
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
