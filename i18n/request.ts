import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED_LOCALES = ["en", "ro", "es"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function detectLocale(acceptLanguage: string): Locale {
  const preferred = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase());

  for (const lang of preferred) {
    if (SUPPORTED_LOCALES.includes(lang as Locale)) {
      return lang as Locale;
    }
  }
  return "en";
}

export default getRequestConfig(async () => {
  // In Next.js 14, cookies() and headers() are synchronous
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  let locale: Locale;

  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as Locale)) {
    locale = cookieLocale as Locale;
  } else {
    const headersList = headers();
    const acceptLanguage = headersList.get("accept-language") ?? "";
    locale = detectLocale(acceptLanguage);
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
