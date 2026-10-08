import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

type MockFn = jest.Mock & { mockResolvedValue(value: unknown): MockFn };

const mockFn = (implementation?: (...args: unknown[]) => unknown): MockFn =>
  jest.fn(implementation) as unknown as MockFn;

interface StoredBooking {
  billboardId: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

interface FindFirstArgs {
  where: {
    billboardId: string;
    status: { notIn: string[] };
    startDate: { lt?: Date; lte?: Date };
    endDate: { gt?: Date; gte?: Date };
  };
}

// Meniru semantik query Prisma untuk kondisi overlap. Jika service tidak
// memakai lt/gt ketat sesuai definisi overlap, helper ini melempar error
// sehingga test gagal jelas (bukan false positive).
function findOverlapInStore(store: StoredBooking[], rawArgs: unknown): StoredBooking | null {
  const where = (rawArgs as FindFirstArgs).where;
  if (!(where.startDate.lt instanceof Date) || !(where.endDate.gt instanceof Date)) {
    throw new Error('Query overlap harus memakai startDate.lt dan endDate.gt (ketat, bukan lte/gte).');
  }
  return (
    store.find(
      (b) =>
        b.billboardId === where.billboardId &&
        !where.status.notIn.includes(b.status) &&
        b.startDate.getTime() < where.startDate.lt!.getTime() &&
        b.endDate.getTime() > where.endDate.gt!.getTime(),
    ) ?? null
  );
}

interface MockPrisma {
  user: { findUnique: MockFn };
  billboard: { findUnique: MockFn };
  booking: { create: MockFn; findFirst: MockFn };
  $transaction: MockFn;
  $queryRaw: MockFn;
}

interface MockMail {
  sendEmail: MockFn;
}

describe('BookingsService.create', () => {
  let service: BookingsService;
  let prisma: MockPrisma;
  let mailService: MockMail;
  let storedBookings: StoredBooking[];

  const user = {
    id: 'user-1',
    name: 'Budi',
    email: 'budi@example.com',
    role: 'CUSTOMER',
  };

  const billboard = {
    id: 'bb-1',
    title: 'Billboard Sudut Malioboro',
    address: 'Jl. Malioboro No. 1',
    status: 'Available',
    price: 1000000,
  };

  beforeEach(() => {
    storedBookings = [];
    prisma = {
      user: { findUnique: mockFn().mockResolvedValue(user) },
      billboard: { findUnique: mockFn().mockResolvedValue(billboard) },
      booking: {
        create: mockFn().mockResolvedValue({ id: 'order-1234567890' }),
        findFirst: mockFn(),
      },
      $transaction: mockFn(),
      $queryRaw: mockFn().mockResolvedValue([]),
    };
    prisma.$transaction.mockImplementation(async (...args: unknown[]) =>
      (args[0] as (tx: unknown) => Promise<unknown>)(prisma),
    );
    prisma.booking.findFirst.mockImplementation(async (args: unknown) =>
      findOverlapInStore(storedBookings, args),
    );
    mailService = { sendEmail: mockFn().mockResolvedValue(undefined) };
    service = new BookingsService(prisma as never, mailService as never);
  });

  function baseDto(overrides: Partial<CreateBookingDto> = {}): CreateBookingDto {
    return {
      billboardId: 'bb-1',
      duration: 2,
      paymentType: 'full',
      designOption: 'upload',
      startDateString: '2026-11-01',
      ...overrides,
    } as CreateBookingDto;
  }

  function createdData() {
    return prisma.booking.create.mock.calls[0][0].data;
  }

  describe('financial integrity (Batch 3-B1)', () => {
    it('Case A: FULL payment dihitung server-side', async () => {
      await service.create(baseDto({ paymentType: 'full' }), user.id);

      expect(createdData().totalPrice).toBe(2270000);
      expect(createdData().dpAmount).toBe(0);
    });

    it('Case B: DP 60% dihitung server-side', async () => {
      await service.create(baseDto({ paymentType: 'dp' }), user.id);

      expect(createdData().totalPrice).toBe(2270000);
      expect(createdData().dpAmount).toBe(1362000);
    });

    it('Case C: client memanipulasi totalPrice/dpAmount diabaikan (full)', async () => {
      await service.create(
        baseDto({ paymentType: 'full', totalPrice: 1, dpAmount: 1 }),
        user.id,
      );

      expect(createdData().totalPrice).toBe(2270000);
      expect(createdData().dpAmount).toBe(0);
    });

    it('Case D: client memanipulasi totalPrice/dpAmount diabaikan (dp)', async () => {
      await service.create(
        baseDto({ paymentType: 'dp', totalPrice: 1, dpAmount: 1 }),
        user.id,
      );

      expect(createdData().totalPrice).toBe(2270000);
      expect(createdData().dpAmount).toBe(1362000);
    });

    it('Case E: duration negatif ditolak (400)', async () => {
      await expect(
        service.create(baseDto({ duration: -5 }), user.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Case F: duration nol ditolak (400)', async () => {
      await expect(
        service.create(baseDto({ duration: 0 }), user.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Case G: duration pecahan ditolak (400)', async () => {
      await expect(
        service.create(baseDto({ duration: 1.5 }), user.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Case G2: duration non-numeric ditolak (400)', async () => {
      await expect(
        service.create(baseDto({ duration: 'dua' as never }), user.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Case H: paymentType invalid ditolak (400)', async () => {
      await expect(
        service.create(baseDto({ paymentType: 'xyz' as never }), user.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Case I: startDateString invalid ditolak (400), bukan error Prisma 500', async () => {
      await expect(
        service.create(baseDto({ startDateString: 'x' }), user.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('harga billboard tidak valid ditolak (400)', async () => {
      prisma.billboard.findUnique.mockResolvedValue({
        ...billboard,
        price: 0,
      });

      await expect(service.create(baseDto(), user.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('harga billboard NaN ditolak (400)', async () => {
      prisma.billboard.findUnique.mockResolvedValue({
        ...billboard,
        price: Number.NaN,
      });

      await expect(service.create(baseDto(), user.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('admin tetap ditolak membuat pesanan', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, role: 'ADMIN' });

      await expect(service.create(baseDto(), user.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });
  });

  describe('overlap protection (Batch 3-B2)', () => {
    it('Test A: overlap penuh ditolak dengan 409 dan booking tidak dibuat', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-20'),
        status: 'ACTIVE',
      });

      const createAttempt = service.create(
        baseDto({ startDateString: '2026-01-15', duration: 1 }),
        user.id,
      );

      await expect(createAttempt).rejects.toBeInstanceOf(ConflictException);
      await expect(createAttempt).rejects.toThrow(
        'Billboard sudah dibooking pada rentang tanggal tersebut.',
      );
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Test B: overlap dari sisi awal ditolak dengan 409', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-20'),
        status: 'PAID_CONFIRMED',
      });

      await expect(
        service.create(
          baseDto({ startDateString: '2026-01-05', duration: 1 }),
          user.id,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Test C: existing berada di dalam new booking ditolak dengan 409', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-15'),
        status: 'ACTIVE',
      });

      await expect(
        service.create(
          baseDto({ startDateString: '2026-01-05', duration: 1 }),
          user.id,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('Test D: boundary existing.endDate === newStartDate TIDAK overlap, booking dibuat', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-20'),
        status: 'ACTIVE',
      });

      const result = await service.create(
        baseDto({ startDateString: '2026-01-20', duration: 1 }),
        user.id,
      );

      expect(result.message).toBe('Sukses');
      expect(prisma.booking.create).toHaveBeenCalledTimes(1);
    });

    it('Test E: billboard berbeda tidak terpengaruh booking billboard lain', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-20'),
        status: 'ACTIVE',
      });
      prisma.billboard.findUnique.mockResolvedValue({
        ...billboard,
        id: 'bb-2',
      });

      const result = await service.create(
        baseDto({ billboardId: 'bb-2', startDateString: '2026-01-15', duration: 1 }),
        user.id,
      );

      expect(result.message).toBe('Sukses');
      expect(prisma.booking.create).toHaveBeenCalledTimes(1);
    });

    it.each(['CANCELLED', 'REFUNDED'])(
      'Test F: booking status %s tidak memblokir booking baru',
      async (releasedStatus) => {
        storedBookings.push({
          billboardId: 'bb-1',
          startDate: new Date('2026-01-10'),
          endDate: new Date('2026-01-20'),
          status: releasedStatus,
        });

        const result = await service.create(
          baseDto({ startDateString: '2026-01-15', duration: 1 }),
          user.id,
        );

        expect(result.message).toBe('Sukses');
        expect(prisma.booking.create).toHaveBeenCalledTimes(1);
      },
    );

    it('Test G: query overlap benar-benar memfilter berdasarkan billboardId', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-20'),
        status: 'ACTIVE',
      });
      prisma.billboard.findUnique.mockResolvedValue({
        ...billboard,
        id: 'bb-2',
      });

      await service.create(
        baseDto({ billboardId: 'bb-2', startDateString: '2026-01-15', duration: 1 }),
        user.id,
      );

      const where = prisma.booking.findFirst.mock.calls[0][0].where;
      expect(where.billboardId).toBe('bb-2');
    });

    it('query overlap memakai kondisi ketat lt/gt sesuai definisi dan status non-blocking', async () => {
      await service.create(
        baseDto({ startDateString: '2026-01-20', duration: 1 }),
        user.id,
      );

      const where = prisma.booking.findFirst.mock.calls[0][0].where;
      expect(where.billboardId).toBe('bb-1');
      expect(where.status.notIn).toEqual(['CANCELLED', 'REFUNDED']);
      expect(where.startDate).toEqual({ lt: new Date('2026-02-20') });
      expect(where.endDate).toEqual({ gt: new Date('2026-01-20') });
    });

    it('booking berstatus DESIGN_RECEIVED (sudah bayar, produksi) tetap memblokir', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-20'),
        status: 'DESIGN_RECEIVED',
      });

      await expect(
        service.create(
          baseDto({ startDateString: '2026-01-15', duration: 1 }),
          user.id,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('booking refund yang masih diproses (PROCESS_REFUND) tetap memblokir', async () => {
      storedBookings.push({
        billboardId: 'bb-1',
        startDate: new Date('2026-01-10'),
        endDate: new Date('2026-01-20'),
        status: 'PROCESS_REFUND',
      });

      await expect(
        service.create(
          baseDto({ startDateString: '2026-01-15', duration: 1 }),
          user.id,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('cek overlap berjalan di dalam $transaction dan mengunci baris billboard', async () => {
      await service.create(baseDto(), user.id);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const rawSql = prisma.$queryRaw.mock.calls[0].join(' ');
      expect(rawSql).toContain('FOR UPDATE');
      expect(rawSql).toContain('Billboard');
    });
  });
});
