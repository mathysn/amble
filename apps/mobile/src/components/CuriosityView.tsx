import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Curiosity, CuriosityDetails } from '@amble/shared';
import { PhotoBlock } from './PhotoBlock';
import { CategoryTag } from './chips';
import { Mono, Overline, Serif } from './typography';
import { useCuriosityDetails } from '../api/hooks';
import { colors } from '../theme';

/** Wikimedia asks every client to identify itself when loading its images. */
const IMAGE_HEADERS = { 'User-Agent': 'Amble/0.1 (walking app; amble-dev)' };
const PHOTO_HEIGHT = 300;

/**
 * A curiosity, in full: its photo, category, name, story, the encyclopedia
 * summary and a few facts, with a footer of actions. Shared by the Discovery
 * moment (shown once, when the walker reaches it) and the Landmark detail page
 * (places already found). The details load separately and fill in when they
 * arrive; without them it's still the name and blurb over the paper placeholder.
 */
export function CuriosityView({
  curiosity,
  kicker,
  topLeft,
  topRight,
  footer,
}: {
  curiosity: Curiosity;
  /** Small line above the name, e.g. "You found a curiosity". */
  kicker?: string;
  /** Round buttons over the photo. */
  topLeft?: ReactNode;
  topRight?: ReactNode;
  footer: ReactNode;
}) {
  const { data: details, isLoading } = useCuriosityDetails(curiosity.id);

  return (
    <View className="flex-1 bg-paper">
      <ScrollView bounces={false}>
        <View>
          <Photo name={curiosity.name} details={details} height={PHOTO_HEIGHT} />
          <SafeAreaView edges={['top']} className="absolute left-0 right-0">
            <View className="flex-row justify-between px-5 pt-2">
              {topLeft ?? <View />}
              {topRight ?? <View />}
            </View>
          </SafeAreaView>
        </View>

        <View className="px-6 pb-6 pt-5">
          {kicker ? (
            <Overline tint="sage" className="mb-3">
              {kicker}
            </Overline>
          ) : null}
          <View className="flex-row items-center gap-2">
            <CategoryTag category={curiosity.category} />
            {curiosity.neighbourhood ? (
              <Mono className="text-ink/40">{curiosity.neighbourhood}</Mono>
            ) : null}
          </View>
          <Serif className="mt-3.5 text-[32px] leading-[35px]">{curiosity.name}</Serif>
          <Text className="mt-3.5 font-sans text-[15px] leading-[25px] text-ink/60">
            {curiosity.blurb}
          </Text>

          {isLoading ? (
            <View className="mt-6 flex-row items-center gap-2.5">
              <ActivityIndicator size="small" color={colors.sage} />
              <Text className="font-sans text-[13px] text-ink/45">Looking up its story…</Text>
            </View>
          ) : null}

          {details?.summary ? (
            <View className="mt-6">
              <Overline className="mb-2">From Wikipedia</Overline>
              <Text className="font-sans text-[15px] leading-[24px] text-ink/75">{details.summary}</Text>
              {details.sourceUrl ? (
                <Pressable
                  onPress={() => void Linking.openURL(details.sourceUrl!)}
                  className="mt-2 self-start py-1"
                >
                  <Text className="font-sans-semibold text-[14px] text-sage-dark">Read more →</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {details && details.facts.length > 0 ? (
            <View className="mt-6">
              <Overline className="mb-1">Good to know</Overline>
              {details.facts.map((f, i) => (
                <Fact key={f.label} label={f.label} value={f.value} last={i === details.facts.length - 1} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} className="bg-paper">
        <View className="flex-row gap-3 px-6 pb-3 pt-3.5">{footer}</View>
      </SafeAreaView>
    </View>
  );
}

/** The real photo when there is one (with its credit), else the paper placeholder. */
function Photo({
  name,
  details,
  height,
}: {
  name: string;
  details: CuriosityDetails | undefined;
  height: number;
}) {
  if (!details?.imageUrl) return <PhotoBlock height={height} caption={`photo · ${name.toLowerCase()}`} />;
  return (
    <View style={{ height }} className="bg-sand-deep">
      <Image
        source={{ uri: details.imageUrl, headers: IMAGE_HEADERS }}
        style={{ width: '100%', height }}
        resizeMode="cover"
        accessibilityLabel={`Photo of ${name}`}
      />
      {details.imageCredit ? (
        <View className="absolute bottom-2 right-2 rounded-[6px] bg-ink/45 px-2 py-0.5">
          <Text className="font-sans text-[10px] text-paper/90">{details.imageCredit}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value, last }: { label: string; value: string; last: boolean }) {
  const link = /^https?:\/\//i.test(value);
  return (
    <View className={`flex-row gap-4 py-3 ${last ? '' : 'border-b border-ink/[0.08]'}`}>
      <Mono className="w-[92px] pt-0.5 text-ink/45">{label.toLowerCase()}</Mono>
      {link ? (
        <Pressable className="flex-1" onPress={() => void Linking.openURL(value)}>
          <Text className="font-sans text-[14px] leading-[20px] text-sage-dark" numberOfLines={1}>
            {value.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}
          </Text>
        </Pressable>
      ) : (
        <Text className="flex-1 font-sans text-[14px] leading-[20px] text-ink">{value}</Text>
      )}
    </View>
  );
}

/** A small square photo of a curiosity (paper placeholder until/unless it has one). */
export function CuriosityThumb({ id, size = 40 }: { id: string; size?: number }) {
  const { data } = useCuriosityDetails(id);
  return (
    <View style={{ width: size, height: size }} className="overflow-hidden rounded-[10px] bg-sand-deep">
      {data?.imageUrl ? (
        <Image
          source={{ uri: data.imageUrl, headers: IMAGE_HEADERS }}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

/** A round button floating over the photo. */
export function PhotoButton({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-10 items-center justify-center rounded-full bg-paper/90"
    >
      {children}
    </Pressable>
  );
}
