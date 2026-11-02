import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { TestAiDto } from './dto/test-ai.dto';

const SETTINGS_ID = 'default_config';
const DEFAULT_SITE_NAME = 'Utero Billboard';
const DEFAULT_SITE_DESC = 'Platform Sewa Billboard Terlengkap';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 15000;
const MASK_PREFIX = '••••';

type SystemSettingRecord = {
  siteName: string;
  siteDesc: string;
  geminiApiKey: string | null;
  googleMapsApiKey: string | null;
  updatedAt: Date;
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private findSettings() {
    return this.prisma.systemSetting.findUnique({ where: { id: SETTINGS_ID } });
  }

  private mask(value: string | null | undefined): string | null {
    if (!value) return null;
    return `${MASK_PREFIX}${value.slice(-4)}`;
  }

  private toMasked(settings: SystemSettingRecord | null) {
    return {
      siteName: settings?.siteName ?? DEFAULT_SITE_NAME,
      siteDesc: settings?.siteDesc ?? DEFAULT_SITE_DESC,
      geminiApiKeyMasked: this.mask(settings?.geminiApiKey),
      geminiApiKeyConfigured: Boolean(settings?.geminiApiKey),
      googleMapsApiKeyMasked: this.mask(settings?.googleMapsApiKey),
      googleMapsApiKeyConfigured: Boolean(settings?.googleMapsApiKey),
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  private normalizeRequiredText(
    value: unknown,
    fieldLabel: string,
    fallback: string,
  ): string {
    if (value === null) return fallback;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldLabel} harus berupa teks.`);
    }
    return value.trim();
  }

  private normalizeSecret(
    value: unknown,
    fieldLabel: string,
    currentMask: string | null,
  ): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldLabel} harus berupa teks atau null.`);
    }

    const trimmed = value.trim();
    if (trimmed.startsWith('•') || trimmed.startsWith('*')) {
      throw new BadRequestException(
        `${fieldLabel} tidak boleh diisi dengan nilai yang sudah dimasker.`,
      );
    }
    if (currentMask && trimmed === currentMask) {
      throw new BadRequestException(
        `${fieldLabel} tidak boleh diisi dengan nilai yang sudah dimasker.`,
      );
    }
    return trimmed;
  }

  async getAdminSettings() {
    const settings = await this.findSettings();
    return this.toMasked(settings);
  }

  async patchSettings(dto: UpdateSettingsDto) {
    const current = await this.findSettings();
    const data: {
      siteName?: string;
      siteDesc?: string;
      geminiApiKey?: string | null;
      googleMapsApiKey?: string | null;
    } = {};

    if (dto.siteName !== undefined) {
      data.siteName = this.normalizeRequiredText(
        dto.siteName,
        'Nama situs',
        DEFAULT_SITE_NAME,
      );
    }

    if (dto.siteDesc !== undefined) {
      data.siteDesc = this.normalizeRequiredText(
        dto.siteDesc,
        'Deskripsi situs',
        DEFAULT_SITE_DESC,
      );
    }

    if (dto.geminiApiKey !== undefined) {
      data.geminiApiKey = this.normalizeSecret(
        dto.geminiApiKey,
        'Gemini API Key',
        this.mask(current?.geminiApiKey),
      );
    }

    if (dto.googleMapsApiKey !== undefined) {
      data.googleMapsApiKey = this.normalizeSecret(
        dto.googleMapsApiKey,
        'Google Maps API Key',
        this.mask(current?.googleMapsApiKey),
      );
    }

    const saved = await this.prisma.systemSetting.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });

    return {
      message: 'Pengaturan berhasil disimpan.',
      data: this.toMasked(saved),
    };
  }

  async testAi(dto: TestAiDto) {
    const providedKey = typeof dto.apiKey === 'string' ? dto.apiKey.trim() : '';
    let apiKey = providedKey;

    if (!apiKey) {
      const settings = await this.findSettings();
      apiKey =
        typeof settings?.geminiApiKey === 'string'
          ? settings.geminiApiKey.trim()
          : '';
    }

    if (!apiKey) {
      throw new BadRequestException('API Key Gemini belum diisi.');
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          contents: [
            {
              parts: [
                {
                  text: 'Buatkan satu slogan singkat untuk Utero Billboard.',
                },
              ],
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          timeout: GEMINI_TIMEOUT_MS,
        },
      );

      const aiResult = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof aiResult !== 'string' || !aiResult.trim()) {
        throw new BadRequestException(
          'Layanan Gemini tidak mengembalikan teks yang valid.',
        );
      }

      return {
        message: 'Koneksi Gemini berhasil.',
        model: GEMINI_MODEL,
        aiResult,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new BadRequestException(
            'Permintaan ke Gemini melewati batas waktu 15 detik.',
          );
        }

        const status = error.response?.status;
        if (status === 400 || status === 401 || status === 403) {
          throw new BadRequestException(
            'API Key Gemini tidak valid atau tidak punya akses.',
          );
        }
        if (status === 404) {
          throw new BadRequestException(
            'Model Gemini tidak tersedia untuk API Key ini.',
          );
        }
        if (status === 429) {
          throw new BadRequestException(
            'Kuota Gemini sedang penuh. Coba lagi nanti.',
          );
        }
        if (status && status >= 500) {
          throw new BadRequestException(
            'Layanan Gemini sedang bermasalah. Coba lagi nanti.',
          );
        }
      }

      throw new BadRequestException('Gagal menghubungi layanan Gemini.');
    }
  }
}
