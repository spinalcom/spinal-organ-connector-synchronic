/*
 * Copyright 2021 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */

import moment = require('moment');
import {
  SpinalContext,
  SpinalGraph,
  SpinalGraphService,
  SpinalNode,
  SpinalNodeRef,
  SPINAL_RELATION_PTR_LST_TYPE,
} from 'spinal-env-viewer-graph-service';

import type OrganConfigModel from '../../model/OrganConfigModel';

import serviceDocumentation, {
  attributeService,
} from 'spinal-env-viewer-plugin-documentation-service';


import { SpinalAttribute } from 'spinal-models-documentation';
import { NetworkService, SpinalBmsEndpoint } from 'spinal-model-bmsnetwork';
import {
  InputDataDevice,
  InputDataEndpoint,
  InputDataEndpointGroup,
  InputDataEndpointDataType,
  InputDataEndpointType,
} from '../../model/InputData/InputDataModel/InputDataModel';

import groupManagerService from 'spinal-env-viewer-plugin-group-manager-service';


import { SpinalServiceTimeseries } from 'spinal-model-timeseries';

import { recordToObject } from '../../utils/recordToObj';
import { IOccupant, spinalOccupantService } from "spinal-model-occupant"
import type { BadgeRecord } from '../../interfaces/api/Badge';
import type { EventRecord } from '../../interfaces/api/Event';

import { ClientApi } from '../../services/ClientAuth';
import { AccessRecord } from '../../interfaces/api/Access';


/**
 * Main purpose of this class is to pull data from client.
 *
 * @export
 * @class SyncRunPull
 */
export class SyncRunPullApi {
  graph: SpinalGraph<any>;
  config: OrganConfigModel;
  interval: number;
  running: boolean;

  // Services spinal
  nwService: NetworkService;
  timeseriesService: SpinalServiceTimeseries;

  // Contexts spinal
  nwContext: SpinalContext<any>;


  // Level 1 Children Nodes
  nwVirtual: SpinalNode<any>;


  clientApi: ClientApi;

  occupantData: Record<string, SpinalNode<any>> = {}; // computedIdentifier -> occupantNode



  constructor(graph: SpinalGraph<any>, config: OrganConfigModel) {
    this.graph = graph;
    this.config = config;
    this.running = false;
    this.nwService = new NetworkService(true);
    this.clientApi = ClientApi.getInstance();
    this.timeseriesService = new SpinalServiceTimeseries();
  }

  private waitFct(nb: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          resolve();
        },
        nb >= 0 ? nb : 0
      );
    });
  }

  async getContextByName(name: string): Promise<SpinalContext<any>> {
    const contexts = await this.graph.getChildren();
    for (const context of contexts) {
      if (context.info.name.get() === name) {
        // @ts-ignore
        SpinalGraphService._addNode(context);
        return context;
      }
    }
    throw new Error(`Context with name ${name} Not found`);
  }

  async initRequiredNodes(): Promise<void> {
    this.nwContext = await this.getContextByName(process.env.NETWORK_NAME);


    this.nwVirtual = (await this.nwContext.getChildrenInContext()).find((node) => node.getName().get() === process.env.VIRTUAL_NETWORK_NAME);
    if (!this.nwVirtual) throw new Error('Virtual Network Node Not found');

    SpinalGraphService._addNode(this.nwVirtual);

    const carrierContext = await spinalOccupantService.createOrGetContext(process.env.CARRIER_CONTEXT_NAME);

  }


  async createEndpoint(
    deviceNode: SpinalNode<any>,
    endpointName: string,
    initialValue: number | string | boolean,
    unit = ''
  ): Promise<SpinalNode<any>> {

    const endpointNodeModel = new InputDataEndpoint(
      endpointName,
      initialValue ?? 0,
      unit,
      InputDataEndpointDataType.Real,
      InputDataEndpointType.Other
    );

    const endpointInfo = await this.nwService.createNewBmsEndpoint(deviceNode.getId().get(), endpointNodeModel);

    const realNode = SpinalGraphService.getRealNode(endpointInfo.id.get());
    // SpinalGraphService._addNode(realNode);


    // await this.timeseriesService.pushFromEndpoint(
    //   endpointInfo.id.get(),
    //   initialValue as number
    // );
    await attributeService.createOrUpdateAttrsAndCategories(
      realNode,
      'default',
      {
        'timeSeries maxDay': '400'
      }
    );
    await this.timeseriesService.getOrCreateTimeSeries(endpointInfo.id.get())

    return realNode;
  }



  async createOccupantData(carriers: BadgeRecord[]) {

    const occupants = await spinalOccupantService.getOccupants(process.env.CARRIER_CONTEXT_NAME)
    for (const carrier of carriers) {
      const user = carrier.user;
      if (!user || typeof user.id !== 'number') continue;

      const occupantKey = String(user.id);
      let foundOcc = occupants.find((occ) => occ.getName().get() === occupantKey);
      if (!foundOcc) {
        const infoOcc: IOccupant = {
          first_name: user.firstname || "",
          last_name: user.lastname || "",
          occupantId: occupantKey,
          email: '',
          serviceName: '',
          companyName: '',
          phoneNumber: ''
        }
        foundOcc = await spinalOccupantService.addOccupant(infoOcc, process.env.CARRIER_CONTEXT_NAME);
      }
      await serviceDocumentation.createOrUpdateAttrsAndCategories(foundOcc, 'Badge', {
        userId: String(user.id),
        userFirstname: user.firstname || "",
        userLastname: user.lastname || "",
        userBlocked: String(user.blocked) ?? 'false',
        badgeId: String(carrier.id),
        badgeUid: carrier.uid || "",
        badgeTechnology: carrier.technology || "",
        badgeOperator: carrier.operator || "",
        badgeMifareProfile: carrier.mifare_profile || "",
        badgeEncodingDate: carrier.encoding_date || "",
        badgeEncodingInfo: carrier.encoding_info || "",
        badgeEncodingCount: String(carrier.encoding_count),
        badgeEncodingSize: String(carrier.encoding_size),
        badgeCreationDate: carrier.creation_date || "",
        badgeUpdateDate: carrier.update_date || "",
        badgeQuotaReached: String(carrier.quota_reached) ?? 'false',
        badgeStatus: carrier.status || "",
        badgeVirtual: String(carrier.virtual),
        badgeVirtualDesign: carrier.virtual_design || "",
        badgeLabel: carrier.label || "",
        identifierId: String(carrier.identifier?.id),
        identifierValue: carrier.identifier?.identifier || "",
        identifierIsAttributed: String(carrier.identifier?.is_attributed) ?? 'false',
        identifierBlocked: String(carrier.identifier?.blocked) ?? 'false',
        identifierComputed: carrier.identifier?.computedIdentifier || "",
        identifierType: carrier.identifier?.type?.name || "",
        identifierFormatId: String(carrier.identifier?.format?.id),
        identifierFormatName: carrier.identifier?.format?.name || "",
        identifierFormatPattern: carrier.identifier?.format?.pattern || "",
      })

      this.occupantData[carrier.identifier?.computedIdentifier] = foundOcc;

    }


  }



  async createDevice(deviceName: string, type: string) {
    const deviceNodeModel = new InputDataDevice(deviceName, type);
    const res = await this.nwService.createNewBmsDevice(this.nwVirtual.getId().get(), deviceNodeModel);
    const createdNode = SpinalGraphService.getRealNode(res.id.get());
    console.log('Created device ', createdNode.getName().get());
    return createdNode;
  }

  async updateEndpoint(endpointNode: SpinalNode<any>, newValue: number | string | boolean, date?: string | number | Date, currentValueUpdate = false) {
    SpinalGraphService._addNode(endpointNode);
    await this.nwService.setEndpointValue(endpointNode.getId().get(), newValue, date);
    // console.log(`Updated endpoint ${endpointNode.getName().get()} with value ${newValue} at ${date ?? new Date().toISOString()}`);
  }


  async createDevicesFromAccesses(accesses: AccessRecord[]) {
    const deviceNodes = await this.nwVirtual.getChildren('hasBmsDevice');

    for (const access of accesses) {
      const deviceName = access.name
      let existingDevice = deviceNodes.find((device) => device.getName().get() === deviceName);
      if (!existingDevice) {
        // Create device if not exist
        existingDevice = await this.createDevice(deviceName, 'AccessPoint');
        await serviceDocumentation.createOrUpdateAttrsAndCategories(existingDevice, 'AccessPoint', {
          id: String(access.id),
          type: String(access.type),
          disabled: String(access.disabled),
          subarea_id: String(access.subarea_id)
        })
        await serviceDocumentation.createOrUpdateAttrsAndCategories(existingDevice, 'ControlUnit', {
          id: String(access.controlUnit?.id),
          name: access.controlUnit?.name || "",
          ip: access.controlUnit?.ip || "",
          protocol: String(access.controlUnit?.protocol) || "",
          created_by: access.controlUnit?.created_by || ""
        })

        const DG = await this.createEndpoint(existingDevice, "Access_Granted", 0)
        const DD = await this.createEndpoint(existingDevice, "Access_Denied", 0)
        const DO_DR = await this.createEndpoint(existingDevice, "Door_Status", 0)
      }
    }
  }

  async updateEndpointsFromEvents(events: EventRecord[]) {
    const deviceNodes = await this.nwVirtual.getChildren('hasBmsDevice');
    const promises = [];
    for (const event of events) {
      const deviceNode = deviceNodes.find((device) => device.getName().get() === event.unit)
      if (!deviceNode) {
        console.warn(`Device node for event unit ${event.unit} not found, skipping event ${event.id}`);
        continue
      }

      const endpointNodes = await deviceNode.getChildren('hasBmsEndpoint');

      let endpointName;
      switch (event.sia_code) {
        case 'DD': endpointName = "Access_Denied"; break;
        case 'DG': endpointName = "Access_Granted"; break;
        case 'DO': endpointName = "Door_Status"; break;
        case 'DR': endpointName = "Door_Status"; break;
        default:
          console.warn(`Unknown SIA code ${event.sia_code} for event ${event.id}, skipping`);
          continue;
      }

      const endpointNode = endpointNodes.find((endpoint) => endpoint.getName().get() === endpointName);
      if (!endpointNode) {
        console.warn(` !! Critical Warning !! Endpoint node ${endpointName} not found for device ${deviceNode.getName().get()}, skipping event ${event.id}`);
        continue;
      }

      let occupantNode;
      if (event.identifier) { // if event has an identifier we try to find the occupant node linked to this identifier (via the computedIdentifier)
        occupantNode = this.occupantData[event.identifier]
        // if we can't find it its an issue as it means we receive an event with an 
        // identifier that we don't have in our occupantData, it can be because we missed an event with 
        // this identifier or because the identifier is new and we haven't received the badge creation event for it, 
        // in both cases we log a warning and skip the event as we won't be able to link it to an occupant
        if (!occupantNode) {
          console.warn(`Occupant node for identifier ${event.identifier} not found, skipping event ${event.id}`);
          continue;
        }
      }


      if (endpointName === "Access_Denied") {
        // For access denied events , if it doesn't have a identifier we inject -1 as value 
        // if it has an identifier we inject the userId having that identifier 
        if (!occupantNode) {
          promises.push(this.updateEndpoint(endpointNode, -1, event.source_date))
        }
        else {
          promises.push(this.updateEndpoint(endpointNode, parseInt(occupantNode.getName().get()), event.source_date))
        }
      }

      if (endpointName === "Access_Granted") {
        // For access granted we inject the userId having the identifier 
        if (!occupantNode) {
          console.warn(` !! Critical Warning !! Access Granted event with identifier ${event.identifier} but no occupant found, skipping event ${event.id}`);
          continue;
        }
        else {
          promises.push(this.updateEndpoint(endpointNode, parseInt(occupantNode.getName().get()), event.source_date))
        }
      }

      if (endpointName === "Door_Status") {
        // For door status we inject 1 for open and 0 for closed
        const doorStatus = event.sia_code === 'DO' ? 1 : 0;
        promises.push(this.updateEndpoint(endpointNode, doorStatus, event.source_date))
      }
    }
    await Promise.all(promises);
  }

  async init(): Promise<void> {
    console.log('Initiating SyncRunPull');
    try {

      await this.nwService.init(this.graph, { contextName: process.env.NETWORK_NAME, contextType: "Network", networkName: process.env.VIRTUAL_NETWORK_NAME, networkType: "NetworkVirtual" });
      await this.initRequiredNodes();
      console.log('Required nodes initialized');

      // const users = await this.clientApi.getUsers();
      // console.log(`Fetched users from client API`);
      // console.log(users);

      const badges = await this.clientApi.getAllBadges();
      console.log(`Fetched badges from client API`);
      // console.log(badges);
      await this.createOccupantData(badges);


      const accesses = await this.clientApi.getAllAccesses();
      console.log(`Fetched accesses from client API`);
      await this.createDevicesFromAccesses(accesses);




      // console.log(accesses);

      console.log('Init DONE !');

    } catch (e) {
      console.error(e);
    }
  }

  async run(): Promise<void> {
    console.log('Starting run...');
    this.running = true;
    const timeout = parseInt(process.env.PULL_INTERVAL);
    await this.waitFct(timeout);
    while (true) {
      if (!this.running) break;
      const before = Date.now();
      try {
        console.log('Run...');
        let events = await this.getEventsToProcess();
        console.log(`Fetched ${events.length} events from client API`);
        events = events.filter(event => event.unit !== null); // filter out events that have event unit null
        console.log(`Filtered events to ${events.length} after removing those with null unit`);
        await this.updateEndpointsFromEvents(events);
        console.log('... Run finished !');
        this.config.lastSync.set(Date.now());
      } catch (e) {
        console.error(e);
        await this.waitFct(1000 * 60);
      } finally {
        const delta = Date.now() - before;
        const timeout = parseInt(process.env.PULL_INTERVAL) - delta;
        await this.waitFct(timeout);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async getEventsToProcess(): Promise<EventRecord[]> {
    const lastSync = Number(this.config.lastSync.get() ?? 0);
    const isFirstSync = !Number.isFinite(lastSync) || lastSync <= 0;

    if (isFirstSync) {
      console.log('First sync detected (lastSync=0), fetching full events history');
      return this.clientApi.getAllEvents();
    }

    const dateFilter = `after:${new Date(lastSync).toISOString()}`;
    console.log(`Incremental sync detected, fetching events with date filter "${dateFilter}"`);
    return this.clientApi.getAllEvents({ date: dateFilter });
  }
}
export default SyncRunPullApi;
