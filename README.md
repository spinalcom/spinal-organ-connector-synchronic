# spinal-organ-connector-synchronic
Simple BOS-SYNCHRONiC api connector
This connector should fetch: 

- List of pass readers.
- Logs of readers -> incremented on endpoints
- List of user IDs.

## Getting Started

These instructions will guide you on how to install and make use of the connector.

### Prerequisites

This module requires a `.env` file in the root directory. Use the `.env.example` file as a template to create your own `.env` file with the necessary configuration.

spinalcom-utils required


### Installation

Clone this repository in the directory of your choice. Navigate to the cloned directory and install the dependencies using the following command:
    
```bash
spinalcom-utils i
```

To build the module, run:

```bash
npm run build
```

### Usage

Start the module with:

```bash
npm run start
```

Or using [pm2](https://pm2.keymetrics.io/docs/usage/quick-start/)
```bash
pm2 start index.js --name organ-connector-xxxxx
```


## Architecture

```mermaid
sequenceDiagram
    participant Hub as Spinal Hub
    participant Connector as Synchronic Connector
    participant API as Synchronic API Server

    Connector->>Hub: Load organ config and digital twin graph
    Hub-->>Connector: Config + graph + contexts

    alt Token missing or expired
        Connector->>API: POST /auth/login?type=password
        API-->>Connector: accessToken + expirationDate
        Connector->>Connector: Cache token to file
    else Token valid in cache
        Connector->>Connector: Reuse cached token
    end

    Connector->>API: GET /badges (all pages, include=identifier,user)
    API-->>Connector: Badges list
    Connector->>Hub: Create/update Occupants + Badge attributes

    Connector->>API: GET /accesses (all pages, include=controlUnit)
    API-->>Connector: Accesses list
    Connector->>Hub: Create/update Devices + Endpoints

    loop Pull interval
        alt First run (lastSync = 0)
            Connector->>API: GET /events (all pages)
        else Incremental run
            Connector->>API: GET /events?date=after:<lastSync ISO>
        end
        API-->>Connector: Events page(s)
        Connector->>Hub: Update endpoints and timeseries from events
        Connector->>Hub: Save new lastSync
    end
```

