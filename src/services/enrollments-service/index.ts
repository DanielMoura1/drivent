import { request } from "@/utils/request";
import { notFoundError, requestError } from "@/errors";
import addressRepository, { CreateAddressParams } from "@/repositories/address-repository";
import enrollmentRepository, { CreateEnrollmentParams } from "@/repositories/enrollment-repository";
import { exclude } from "@/utils/prisma-utils";
import { Address, Enrollment } from "@prisma/client";
import { ViaCEPAddress } from "../../protocols.js";

async function getAddressFromCEP(cep: string) {
  const result = await request.get(`https://viacep.com.br/ws/${cep}/json/`);

  if (!result.data) {
    throw notFoundError();
  }
  const res ={
    bairro: result.data.bairro,
    cidade: result.data.localidade,
    complemento: result.data.complemento,
    logradouro: result.data.logradouro,
    uf: result.data.uf
  };
  return res;
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw notFoundError();

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, "userId", "createdAt", "updatedAt", "Address"),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, "userId" | "createdAt" | "updatedAt">;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, "createdAt", "updatedAt", "enrollmentId");
}

type GetAddressResult = Omit<Address, "createdAt" | "updatedAt" | "enrollmentId">;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  const enrollment = exclude(params, "address");
  const address = getAddressForUpsert(params.address);
  console.log("d");
  console.log(address.cep);
  //TODO - Verificar se o CEP é válido
  const result = await request.get(`https://viacep.com.br/ws/${address.cep}/json/`);
  console.log(result.data);
  if (result.data.erro===true) {
    console.log("entrei no if");
    throw requestError(400, "cep");
  }
  if (!result.data) {
    throw notFoundError();
  }
  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, "userId"));

  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP
};

export default enrollmentsService;
