import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { LoginAuthDto } from './dto/login-auth.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

export const roundsOfHashing = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(registerAuthDto: RegisterAuthDto) {
    try {
      const { name, email, password } = registerAuthDto;

      if (name === '' || email === '' || password === '') {
        throw new BadRequestException('All fields are required');
      }

      const hashedPassword = await bcrypt.hash(password, roundsOfHashing);

      registerAuthDto.password = hashedPassword;

      return await this.prismaService.user.create({
        data: registerAuthDto,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 - is prisma error code for unique constraint violation...
        if (e.code === 'P2002') {
          throw new BadRequestException('This account is not available.');
        }
      }
      throw new BadRequestException(e);
    }
  }

  async login(loginAuthDto: LoginAuthDto, response: Response) {
    try {
      const { email, password } = loginAuthDto;

      if (email === '' || password === '') {
        throw new BadRequestException('Email and password is required');
      }

      const user = await this.prismaService.user.findUnique({
        where: {
          email: email,
        },
        select: {
          id: true,
          email: true,
          password: true,
        },
      });

      if (!user) {
        throw new NotFoundException('Account not found!');
      }

      const isPasswordValue = await bcrypt.compare(password, user.password);

      if (!isPasswordValue) {
        throw new UnauthorizedException('Invalid password!');
      }

      const jwt = await this.jwtService.signAsync({ id: user.id });

      response.cookie('fuckingjwt', jwt, { httpOnly: true });

      return {
        message: 'Success',
      };
    } catch (e) {
      throw new BadRequestException(e);
    }
  }

  async logout(response: Response) {
    try {
      response.clearCookie('fuckingjwt');

      return {
        message: 'Log out successfully',
      };
    } catch (e) {
      throw new BadRequestException(e);
    }
  }

  async user(request: Request) {
    try {
      const cookie = request.cookies['fuckingjwt'];

      const cookieData = await this.jwtService.verifyAsync(cookie);

      if (!cookieData) {
        throw new UnauthorizedException();
      }

      const userData = await this.prismaService.user.findFirst({
        where: {
          id: cookieData.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      return userData;
    } catch (e) {
      throw new UnauthorizedException();
    }
  }
}
