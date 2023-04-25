module BillMetadata exposing (BillMetadata, BillMetadataRes, decoder)

import Json.Decode exposing (Decoder, field, list, map, map2, map3, string)


type alias BillMetadata =
    { title : String, url : String, number : String }


type alias BillMetadataRes =
    { bills : List BillMetadata
    , pagination : Pagination
    }


type alias Pagination =
    { next : String }


billDecoder : Decoder BillMetadata
billDecoder =
    map3 BillMetadata
        (field "title" string)
        (field "url" string)
        (field "number" string)


billListDecoder : Decoder (List BillMetadata)
billListDecoder =
    list billDecoder


decoder : Decoder BillMetadataRes
decoder =
    map2 BillMetadataRes
        (field "bills" billListDecoder)
        (field "pagination" paginationDecoder)


paginationDecoder : Decoder Pagination
paginationDecoder =
    map Pagination (field "next" string)
